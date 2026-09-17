# Plan B — Rules Model & Scoring Engine

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The app owns the league's rules (scoring, roster slots, settings) — pre-filled from Sleeper, editable on a Rules screen, persisted in SQLite — and has a pure, tested scoring engine that turns a stat line + rules + position into fantasy points.

**Architecture:** A shared `Rules` model (`src/shared/rules.ts`) and a shared stat-key catalogue (`src/shared/statKeys.ts`) are used by main and renderer. Main gets a `mapRules` Sleeper mapper, a `rules` repository over three new tables (migration 002), a pure `scoring/` module (`scoreStatLine`, `normalizeRules`), and three IPC handlers. The Sleeper sync writes rules on import and keeps them in sync only while they are still Sleeper-sourced; custom edits are never overwritten except by an explicit re-import. The renderer gets a Rules screen driven by a small pure view-model module.

**Tech Stack:** Same as Plan A — Electron 39, electron-vite 5, React 19, TypeScript 5 (strict), Tailwind 4, shadcn/ui, lucide-react, `node:sqlite`, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-15-slice1-league-sync-stats-pipeline-design.md` §7 (rules model, import mapping, scoring engine), §8 (`rules`, `scoring_rules`, `roster_slots` tables), §10 screen 3 (Rules), §12 test list. This plan covers spec milestone 4 and the pure half of milestone 6. **Plan C** owns the nflverse `toStatLine` adapters, `player_week_points` and `recomputePoints` (they need the stats tables), and points on the League/Players screens.

**Builds on:** Plan A (`v0.1.0`, HEAD `534d936`). All Plan A files referenced below exist as described in `docs/superpowers/plans/2026-09-15-plan-a-foundation-and-league-sync.md`.

## Global Constraints

- Node **≥ 22.13** in WSL (`.nvmrc` pins 22); every shell below starts with `source ~/.nvm/nvm.sh && nvm use` from the project root. Electron **≥ 35**.
- Storage is Node's built-in `node:sqlite` (`DatabaseSync`). **No native modules** in `dependencies`. `node:sqlite` binds only `null | number | bigint | string | Uint8Array` — convert booleans to `0/1`, never pass `undefined`.
- `contextIsolation: true`, `nodeIntegration: false`; the renderer never touches SQLite or the network. All Sleeper calls go through `src/main/sources/sleeper.ts`.
- Core modules (`sources`, `db`, `scoring`, `sync`, `shared`) import nothing from `electron`.
- `StatKey` uses **Sleeper's scoring vocabulary** (`pass_yd`, `rec`, `fgm_40_49`, `pts_allow_7_13`, …). Unknown keys from Sleeper are **kept**, never dropped.
- Every network-touching sync step writes a `sync_log` row (`running` → `ok` | `error` | `skipped`). Sources are independent.
- Points values are rounded to **4 decimals** on import and on save (Sleeper float noise: `0.03999999910593033`); computed scores are rounded to **2 decimals**.
- Dark theme only. Use the existing shadcn primitives in `src/renderer/src/components/ui/` (badge, button, card, input, table); no new UI packages.
- Git: `main` branch, Conventional Commits (summary ≤ 50 chars, imperative), atomic commits, ending with the `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>` line required by the environment.
- Verification before every commit: `npm run typecheck && npm run lint && npm test` all clean. Lint enforces Prettier formatting — if it reports formatting errors, run `npm run format` and re-lint; the code blocks below are written for Prettier's 100-column, no-semicolon style but line breaks may differ.
- When a task says "add an import" to a file that already imports from that module, **merge into the existing import line** (one import per module; the lint config rejects duplicates).
- UI task (6): the code given is the functional baseline. After it typechecks and the human check passes, the implementer may load the `frontend-design` skill to refine spacing, hierarchy and colour — without changing component names, props or IPC usage.

## Design decisions (deviations from / refinements of the spec — flag to the user if they disagree)

1. **Bonus thresholds are `>=` as the spec says** (`bonus_rush_yd_100` fires at `rush_yd >= 100`). If Sleeper's tiers turn out to be ranges (100–199 / 200+), each is a one-value change: give `inRange(...)` in `DERIVED_STATS` a `max`. Points-allowed and yards-allowed tiers *are* ranges and use `max`.
2. **Refresh keeps custom rules.** `syncLeague` writes `mapRules(...)` only when no rules exist or `source === 'sleeper'`. Only `rules.reimportFromSleeper()` overwrites custom rules.
3. `positionOverrides` is **required** (default `{}`) rather than optional — removes `?.` noise everywhere.
4. `StatKey = string` plus a typed catalogue (`STAT_KEYS`), because unknown Sleeper keys must survive round-trips. `supported: true` in the catalogue is the **contract Plan C's adapters must fulfil** (every supported raw key is emitted by `toStatLine`).
5. `scoring_rules.position = ''` means "all positions" (SQLite treats `NULL`s in a composite PK as distinct, so `NULL` can't be the "no position" marker).
6. `rules.update` has a marked hook where Plan C inserts `recomputePoints`.
7. Plan ends with a `0.2.0` version bump, Windows build and tag, mirroring Plan A's Task 13.

**The user's real league** (read from the imported `leagues.sleeper_raw` on 2026-09-17, 16 teams): 43 scoring keys, **no `bonus_*` keys** (decision 1 does not affect it), kicking via `fgm_50_59`/`fgm_60p`/`fgmiss`, DEF tiers `pts_allow_0..35p` = 10/7/4/1/0/-1/-4, `fum_rec: 2`; four keys will show as unsupported: `st_ff`, `st_fum_rec`, `def_st_ff`, `def_st_fum_rec` (1 pt each). `waiver_type: 1` → `priority` (its `waiver_budget: 100` is ignored), trade deadline 12, playoffs week 15 / 6 teams. Roster `QB RB RB WR WR TE FLEX FLEX K DEF BN×6`, no IR. Task 7's human check should see exactly these values.

## File map

```
src/shared/rules.ts                        Rules model: StatKey, Position, Slot, LeagueSettings, Rules, roundPoints
src/shared/statKeys.ts                     Stat-key catalogue: label, category, supported flag
src/shared/ipc.ts                          + rules.get / rules.update / rules.reimportFromSleeper
src/main/scoring/engine.ts                 StatLine, DERIVED_STATS, effectiveScoring, statValue, scoreStatLine
src/main/scoring/normalize.ts              normalizeRules (validates renderer input, stamps source=custom)
src/main/db/migrations/002_rules.sql       rules, scoring_rules, roster_slots
src/main/db/migrations/index.ts            + migration 2
src/main/db/repos/rules.ts                 saveRules, getRules
src/main/sync/mappers.ts                   + mapRules (Sleeper league → Rules)
src/main/sync/sleeperSync.ts               syncLeague writes rules; + SOURCE_RULES, reimportRules
src/main/ipc/handlers.ts                   + three rules handlers
src/preload/index.ts                       + rules bridge
src/renderer/src/lib/rulesView.ts          pure view-model: scoringGroups, unsupportedKeys, addableKeys, addableSlots
src/renderer/src/screens/RulesScreen.tsx   Rules screen
src/renderer/src/components/Sidebar.tsx    enable Rules
src/renderer/src/App.tsx                   route Rules
tests/fixtures/rules.ts                    rules() fixture builder
tests/shared/statKeys.test.ts
tests/main/scoring/{engine,normalize}.test.ts
tests/main/db/{migrate,rulesRepo}.test.ts
tests/main/sync/{mappers,sleeperSync}.test.ts   (+ rules cases)
tests/renderer/lib/rulesView.test.ts
```

---

### Task 1: Rules model, stat-key catalogue, Sleeper → Rules mapper

**Files:**
- Create: `src/shared/rules.ts`, `src/shared/statKeys.ts`, `tests/shared/statKeys.test.ts`
- Modify: `src/main/sync/mappers.ts`, `tests/main/sync/mappers.test.ts`

**Interfaces:**
- Consumes: `SleeperLeague` (`src/main/sources/sleeper-types.ts`: `settings: Record<string, number>`, `scoring_settings: Record<string, number>`, `roster_positions: string[]`, `total_rosters`).
- Produces: `Rules`, `StatKey`, `Position`, `POSITIONS`, `KNOWN_SLOTS`, `RosterSlotCount`, `LeagueSettings`, `WaiverType`, `RulesSource`, `roundPoints(v: number): number` (all in `@shared/rules`); `STAT_KEYS`, `STAT_KEY_INFO`, `STAT_CATEGORIES`, `StatCategory`, `StatKeyInfo`, `isSupported(key)` (in `@shared/statKeys`); `mapRules(l: SleeperLeague, updatedAt: string): Rules` (in `@main/sync/mappers`).

- [x] **Step 1: Write the failing mapper tests**

Append to `tests/main/sync/mappers.test.ts` inside the existing `describe('mappers', …)` block (and add `mapRules` to the import from `@main/sync/mappers`):

```ts
  describe('mapRules', () => {
    it('maps scoring key-for-key, roster slot counts and settings', () => {
      const rules = mapRules(fx.league, 'T')
      expect(rules.source).toBe('sleeper')
      expect(rules.updatedAt).toBe('T')
      expect(rules.scoring).toEqual({
        rec: 1,
        rush_yd: 0.1,
        rec_yd: 0.1,
        rush_td: 6,
        rec_td: 6,
        pass_td: 4,
        pass_yd: 0.04,
        fum_lost: -2
      })
      expect(rules.positionOverrides).toEqual({})
      expect(rules.rosterSlots).toEqual([
        { slot: 'QB', count: 1 },
        { slot: 'RB', count: 2 },
        { slot: 'WR', count: 2 },
        { slot: 'TE', count: 1 },
        { slot: 'FLEX', count: 1 },
        { slot: 'K', count: 1 },
        { slot: 'DEF', count: 1 },
        { slot: 'BN', count: 6 },
        { slot: 'IR', count: 1 }
      ])
      expect(rules.settings).toEqual({
        numTeams: 2,
        waiverType: 'faab',
        faabBudget: 100,
        tradeDeadlineWeek: 13,
        playoffStartWeek: 15,
        playoffTeams: 6
      })
    })

    it('rounds float noise and keeps unknown keys', () => {
      const rules = mapRules(
        { ...fx.league, scoring_settings: { pass_yd: 0.03999999910593033, def_3_and_out: 1 } },
        'T'
      )
      expect(rules.scoring).toEqual({ pass_yd: 0.04, def_3_and_out: 1 })
    })

    it('maps priority waivers, "no deadline" (99) and missing settings', () => {
      const rules = mapRules(
        { ...fx.league, settings: { num_teams: 10, waiver_type: 0, trade_deadline: 99 } },
        'T'
      )
      expect(rules.settings).toEqual({ numTeams: 10, waiverType: 'priority' })
    })

    it('falls back to total_rosters when num_teams is missing', () => {
      const rules = mapRules({ ...fx.league, settings: {} }, 'T')
      expect(rules.settings.numTeams).toBe(2)
    })
  })
```

Create `tests/shared/statKeys.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { STAT_CATEGORIES, STAT_KEY_INFO, STAT_KEYS, isSupported } from '@shared/statKeys'

describe('stat key catalogue', () => {
  it('has unique keys', () => {
    const keys = STAT_KEYS.map((k) => k.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('uses only declared categories', () => {
    const ids = new Set(STAT_CATEGORIES.map((c) => c.id))
    for (const k of STAT_KEYS) expect(ids.has(k.category), k.key).toBe(true)
  })

  it('reports support', () => {
    expect(STAT_KEY_INFO.get('rec')?.label).toBe('Reception')
    expect(isSupported('rec')).toBe(true)
    expect(isSupported('pass_td_40p')).toBe(false)
    expect(isSupported('totally_unknown')).toBe(false)
  })
})
```

- [x] **Step 2: Run the tests to verify they fail**

Run: `source ~/.nvm/nvm.sh && nvm use && npx vitest run tests/main/sync/mappers.test.ts tests/shared/statKeys.test.ts`
Expected: FAIL — `Failed to resolve import "@shared/statKeys"` and `mapRules is not a function` (or "does not provide an export named 'mapRules'").

- [x] **Step 3: Create the rules model**

Create `src/shared/rules.ts`:

```ts
/**
 * Sleeper's scoring vocabulary (`pass_yd`, `rec`, `fgm_40_49`, `pts_allow_7_13`, …).
 * A plain string: unknown keys coming from Sleeper are kept as-is. See `statKeys.ts`
 * for the catalogue of keys this app knows about.
 */
export type StatKey = string

export const POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF', 'DL', 'LB', 'DB'] as const
export type Position = (typeof POSITIONS)[number]

/** Roster slot names as Sleeper spells them in `roster_positions`. Custom names are allowed. */
export const KNOWN_SLOTS = [
  'QB',
  'RB',
  'WR',
  'TE',
  'FLEX',
  'SUPER_FLEX',
  'REC_FLEX',
  'WRRB_FLEX',
  'K',
  'DEF',
  'DL',
  'LB',
  'DB',
  'IDP_FLEX',
  'BN',
  'IR',
  'TAXI'
] as const
export type Slot = string

export interface RosterSlotCount {
  slot: Slot
  count: number
}

export type WaiverType = 'faab' | 'priority'

export interface LeagueSettings {
  numTeams: number
  waiverType: WaiverType
  faabBudget?: number
  tradeDeadlineWeek?: number
  playoffStartWeek?: number
  playoffTeams?: number
}

export type RulesSource = 'sleeper' | 'custom'

export interface Rules {
  source: RulesSource
  updatedAt: string
  /** Points per unit of each stat, e.g. `{ rec: 1, rec_yd: 0.1, rush_td: 6, fum_lost: -2 }`. */
  scoring: Record<StatKey, number>
  /** Per-position replacements for entries in `scoring`, e.g. TE premium `{ TE: { rec: 1.5 } }`. */
  positionOverrides: Partial<Record<Position, Record<StatKey, number>>>
  /** Ordered as Sleeper lists them; `count` is the number of slots of that kind. */
  rosterSlots: RosterSlotCount[]
  settings: LeagueSettings
}

/** Sleeper values carry float noise (0.03999999910593033); 4 decimals keep 0.025-style settings intact. */
export function roundPoints(value: number): number {
  return Math.round(value * 10000) / 10000
}
```

- [x] **Step 4: Create the stat-key catalogue**

Create `src/shared/statKeys.ts`. `supported: true` means Plan C's nflverse adapters can produce the raw stat (or, for bonus/tier keys, the stat they derive from). Keep `false` entries — they appear on the Rules screen as "unsupported".

```ts
import type { StatKey } from './rules'

export type StatCategory =
  | 'passing'
  | 'rushing'
  | 'receiving'
  | 'misc'
  | 'bonus'
  | 'kicking'
  | 'defense'
  | 'idp'
  | 'other'

export interface StatKeyInfo {
  key: StatKey
  label: string
  category: StatCategory
  /** true = computable from nflverse data (Plan C adapters). false = scores 0, listed as "unsupported". */
  supported: boolean
}

export const STAT_CATEGORIES: { id: StatCategory; label: string }[] = [
  { id: 'passing', label: 'Passing' },
  { id: 'rushing', label: 'Rushing' },
  { id: 'receiving', label: 'Receiving' },
  { id: 'misc', label: 'Misc offense' },
  { id: 'bonus', label: 'Bonuses' },
  { id: 'kicking', label: 'Kicking' },
  { id: 'defense', label: 'Team defense' },
  { id: 'idp', label: 'IDP' },
  { id: 'other', label: 'Other (unknown to this app)' }
]

function s(key: StatKey, label: string, category: StatCategory, supported = true): StatKeyInfo {
  return { key, label, category, supported }
}

export const STAT_KEYS: StatKeyInfo[] = [
  // passing
  s('pass_yd', 'Passing yards', 'passing'),
  s('pass_td', 'Passing TD', 'passing'),
  s('pass_int', 'Interception thrown', 'passing'),
  s('pass_2pt', 'Passing 2-pt conversion', 'passing'),
  s('pass_att', 'Pass attempt', 'passing'),
  s('pass_cmp', 'Completion', 'passing'),
  s('pass_inc', 'Incompletion', 'passing'),
  s('pass_sack', 'Sacked', 'passing'),
  s('pass_fd', 'Passing first down', 'passing'),
  s('pass_cmp_40p', 'Completion of 40+ yards', 'passing'),
  s('pass_td_40p', 'Passing TD of 40+ yards', 'passing', false),
  s('pass_td_50p', 'Passing TD of 50+ yards', 'passing', false),
  s('pass_int_td', 'Pick-six thrown', 'passing', false),
  // rushing
  s('rush_yd', 'Rushing yards', 'rushing'),
  s('rush_td', 'Rushing TD', 'rushing'),
  s('rush_2pt', 'Rushing 2-pt conversion', 'rushing'),
  s('rush_att', 'Rush attempt', 'rushing'),
  s('rush_fd', 'Rushing first down', 'rushing'),
  s('rush_40p', 'Rush of 40+ yards', 'rushing'),
  s('rush_td_40p', 'Rushing TD of 40+ yards', 'rushing', false),
  s('rush_td_50p', 'Rushing TD of 50+ yards', 'rushing', false),
  // receiving
  s('rec', 'Reception', 'receiving'),
  s('rec_yd', 'Receiving yards', 'receiving'),
  s('rec_td', 'Receiving TD', 'receiving'),
  s('rec_2pt', 'Receiving 2-pt conversion', 'receiving'),
  s('rec_tgt', 'Target', 'receiving'),
  s('rec_fd', 'Receiving first down', 'receiving'),
  s('rec_40p', 'Reception of 40+ yards', 'receiving'),
  s('rec_td_40p', 'Receiving TD of 40+ yards', 'receiving', false),
  s('rec_td_50p', 'Receiving TD of 50+ yards', 'receiving', false),
  s('rec_0_4', 'Reception of 0-4 yards', 'receiving', false),
  s('rec_5_9', 'Reception of 5-9 yards', 'receiving', false),
  s('rec_10_19', 'Reception of 10-19 yards', 'receiving', false),
  s('rec_20_29', 'Reception of 20-29 yards', 'receiving', false),
  s('rec_30_39', 'Reception of 30-39 yards', 'receiving', false),
  // misc offense
  s('fum', 'Fumble', 'misc'),
  s('fum_lost', 'Fumble lost', 'misc'),
  s('fum_rec', 'Fumble recovery', 'misc'),
  s('fum_rec_td', 'Fumble recovery TD', 'misc'),
  s('st_td', 'Special teams TD', 'misc'),
  s('st_ff', 'Special teams forced fumble', 'misc', false),
  s('st_fum_rec', 'Special teams fumble recovery', 'misc', false),
  s('pr_yd', 'Punt return yards', 'misc'),
  s('kr_yd', 'Kick return yards', 'misc'),
  s('pr_td', 'Punt return TD', 'misc', false),
  s('kr_td', 'Kick return TD', 'misc', false),
  // bonuses (derived in the engine)
  s('bonus_pass_yd_300', '300+ passing yards', 'bonus'),
  s('bonus_pass_yd_400', '400+ passing yards', 'bonus'),
  s('bonus_rush_yd_100', '100+ rushing yards', 'bonus'),
  s('bonus_rush_yd_200', '200+ rushing yards', 'bonus'),
  s('bonus_rec_yd_100', '100+ receiving yards', 'bonus'),
  s('bonus_rec_yd_200', '200+ receiving yards', 'bonus'),
  s('bonus_rush_rec_yd_100', '100+ rushing + receiving yards', 'bonus'),
  s('bonus_rush_rec_yd_200', '200+ rushing + receiving yards', 'bonus'),
  s('bonus_pass_cmp_25', '25+ completions', 'bonus'),
  s('bonus_rush_att_20', '20+ carries', 'bonus'),
  s('bonus_rec_te', 'Per reception (TE)', 'bonus'),
  s('bonus_rec_rb', 'Per reception (RB)', 'bonus'),
  s('bonus_rec_wr', 'Per reception (WR)', 'bonus'),
  // kicking
  s('xpm', 'Extra point made', 'kicking'),
  s('xpmiss', 'Extra point missed', 'kicking'),
  s('fgm', 'Field goal made', 'kicking'),
  s('fgmiss', 'Field goal missed', 'kicking'),
  s('fgm_0_19', 'FG made 0-19', 'kicking'),
  s('fgm_20_29', 'FG made 20-29', 'kicking'),
  s('fgm_30_39', 'FG made 30-39', 'kicking'),
  s('fgm_40_49', 'FG made 40-49', 'kicking'),
  s('fgm_50p', 'FG made 50+', 'kicking'),
  s('fgm_50_59', 'FG made 50-59', 'kicking'),
  s('fgm_60p', 'FG made 60+', 'kicking'),
  s('fgmiss_0_19', 'FG missed 0-19', 'kicking'),
  s('fgmiss_20_29', 'FG missed 20-29', 'kicking'),
  s('fgmiss_30_39', 'FG missed 30-39', 'kicking'),
  s('fgmiss_40_49', 'FG missed 40-49', 'kicking'),
  s('fgmiss_50p', 'FG missed 50+', 'kicking'),
  s('fgm_yds', 'FG yards (made)', 'kicking'),
  s('fgm_yds_over_30', 'FG yards over 30 (made)', 'kicking', false),
  // team defense
  s('sack', 'Sack', 'defense'),
  s('int', 'Interception', 'defense'),
  s('ff', 'Forced fumble', 'defense'),
  s('safe', 'Safety', 'defense'),
  s('blk_kick', 'Blocked kick', 'defense'),
  s('def_td', 'Defensive TD', 'defense'),
  s('def_st_td', 'Special teams TD (DEF)', 'defense'),
  s('def_st_ff', 'Special teams forced fumble (DEF)', 'defense', false),
  s('def_st_fum_rec', 'Special teams fumble recovery (DEF)', 'defense', false),
  s('def_2pt', 'Defensive 2-pt return', 'defense'),
  s('def_pass_def', 'Pass defended', 'defense'),
  s('def_forced_punts', 'Forced punt', 'defense', false),
  s('def_4_and_stop', '4th-down stop', 'defense', false),
  s('def_3_and_out', 'Three-and-out', 'defense', false),
  s('def_kr_yd', 'Kick return yards (DEF)', 'defense', false),
  s('def_pr_yd', 'Punt return yards (DEF)', 'defense', false),
  s('pts_allow', 'Points allowed (per point)', 'defense'),
  s('pts_allow_0', '0 points allowed', 'defense'),
  s('pts_allow_1_6', '1-6 points allowed', 'defense'),
  s('pts_allow_7_13', '7-13 points allowed', 'defense'),
  s('pts_allow_14_20', '14-20 points allowed', 'defense'),
  s('pts_allow_21_27', '21-27 points allowed', 'defense'),
  s('pts_allow_28_34', '28-34 points allowed', 'defense'),
  s('pts_allow_35p', '35+ points allowed', 'defense'),
  s('yds_allow', 'Yards allowed (per yard)', 'defense'),
  s('yds_allow_0_100', '0-99 yards allowed', 'defense'),
  s('yds_allow_100_199', '100-199 yards allowed', 'defense'),
  s('yds_allow_200_299', '200-299 yards allowed', 'defense'),
  s('yds_allow_300_349', '300-349 yards allowed', 'defense'),
  s('yds_allow_350_399', '350-399 yards allowed', 'defense'),
  s('yds_allow_400_449', '400-449 yards allowed', 'defense'),
  s('yds_allow_450_499', '450-499 yards allowed', 'defense'),
  s('yds_allow_500_549', '500-549 yards allowed', 'defense'),
  s('yds_allow_550p', '550+ yards allowed', 'defense'),
  // IDP
  s('idp_tkl', 'Tackle (total)', 'idp'),
  s('idp_tkl_solo', 'Solo tackle', 'idp'),
  s('idp_tkl_ast', 'Assisted tackle', 'idp'),
  s('idp_tkl_loss', 'Tackle for loss', 'idp'),
  s('idp_qb_hit', 'QB hit', 'idp'),
  s('idp_sack', 'Sack (IDP)', 'idp'),
  s('idp_sack_yd', 'Sack yards (IDP)', 'idp'),
  s('idp_int', 'Interception (IDP)', 'idp'),
  s('idp_int_ret_yd', 'Interception return yards (IDP)', 'idp'),
  s('idp_pass_def', 'Pass defended (IDP)', 'idp'),
  s('idp_ff', 'Forced fumble (IDP)', 'idp'),
  s('idp_fum_rec', 'Fumble recovery (IDP)', 'idp'),
  s('idp_fum_ret_yd', 'Fumble return yards (IDP)', 'idp'),
  s('idp_def_td', 'Defensive TD (IDP)', 'idp'),
  s('idp_safe', 'Safety (IDP)', 'idp'),
  s('idp_blk_kick', 'Blocked kick (IDP)', 'idp')
]

export const STAT_KEY_INFO: ReadonlyMap<StatKey, StatKeyInfo> = new Map(
  STAT_KEYS.map((k) => [k.key, k])
)

export function isSupported(key: StatKey): boolean {
  return STAT_KEY_INFO.get(key)?.supported ?? false
}
```

- [x] **Step 5: Add `mapRules` to the mappers**

In `src/main/sync/mappers.ts`, add to the imports:

```ts
import { roundPoints, type LeagueSettings, type Rules, type StatKey } from '@shared/rules'
```

and append at the end of the file:

```ts
const SLEEPER_WAIVER_FAAB = 2
const SLEEPER_NO_TRADE_DEADLINE = 99

export function mapRules(l: SleeperLeague, updatedAt: string): Rules {
  const scoring: Record<StatKey, number> = {}
  for (const [key, value] of Object.entries(l.scoring_settings)) {
    if (typeof value === 'number' && Number.isFinite(value)) scoring[key] = roundPoints(value)
  }

  const counts = new Map<string, number>()
  for (const slot of l.roster_positions) counts.set(slot, (counts.get(slot) ?? 0) + 1)
  const rosterSlots = [...counts].map(([slot, count]) => ({ slot, count }))

  const s: Partial<Record<string, number>> = l.settings
  const settings: LeagueSettings = {
    numTeams: s.num_teams ?? l.total_rosters,
    waiverType: s.waiver_type === SLEEPER_WAIVER_FAAB ? 'faab' : 'priority'
  }
  if (settings.waiverType === 'faab' && s.waiver_budget !== undefined)
    settings.faabBudget = s.waiver_budget
  if (s.trade_deadline !== undefined && s.trade_deadline !== SLEEPER_NO_TRADE_DEADLINE)
    settings.tradeDeadlineWeek = s.trade_deadline
  if (s.playoff_week_start !== undefined) settings.playoffStartWeek = s.playoff_week_start
  if (s.playoff_teams !== undefined) settings.playoffTeams = s.playoff_teams

  return { source: 'sleeper', updatedAt, scoring, positionOverrides: {}, rosterSlots, settings }
}
```

- [x] **Step 6: Run the tests to verify they pass**

Run: `source ~/.nvm/nvm.sh && nvm use && npx vitest run tests/main/sync/mappers.test.ts tests/shared/statKeys.test.ts`
Expected: all pass (the 4 new `mapRules` cases + 3 catalogue cases + the existing mapper cases).

- [x] **Step 7: Typecheck, lint, commit**

```bash
source ~/.nvm/nvm.sh && nvm use && npm run typecheck && npm run lint && npm test
```
Expected: no errors; all tests pass.

```bash
git add -A && git commit -q -m "feat(rules): add rules model, stat catalogue, mapper

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Scoring engine

**Files:**
- Create: `src/main/scoring/engine.ts`, `tests/fixtures/rules.ts`, `tests/main/scoring/engine.test.ts`

**Interfaces:**
- Consumes: `Rules`, `Position`, `StatKey` from `@shared/rules`; `STAT_KEY_INFO` from `@shared/statKeys`.
- Produces: `StatLine = Partial<Record<StatKey, number>>`; `DERIVED_STATS: Partial<Record<StatKey, (line: StatLine, position: Position | null) => number>>`; `effectiveScoring(rules, position): Record<StatKey, number>`; `statValue(key, line, position): number`; `scoreStatLine(line: StatLine, rules: Rules, position: Position | null): number` (rounded to 2 dp). Plan C's `toStatLine` adapters must emit `StatLine`s whose keys are the `supported` raw keys of the catalogue, including `pts_allow` and `yds_allow` as raw totals for DEF lines.

- [x] **Step 1: Create the rules fixture**

Create `tests/fixtures/rules.ts`:

```ts
import type { Rules } from '@shared/rules'

/** A standard 12-team PPR rule set; override any field for a scenario. */
export function rules(overrides: Partial<Rules> = {}): Rules {
  return {
    source: 'sleeper',
    updatedAt: '2026-09-17T12:00:00.000Z',
    scoring: {
      pass_yd: 0.04,
      pass_td: 4,
      pass_int: -1,
      rush_yd: 0.1,
      rush_td: 6,
      rec: 1,
      rec_yd: 0.1,
      rec_td: 6,
      fum_lost: -2
    },
    positionOverrides: {},
    rosterSlots: [
      { slot: 'QB', count: 1 },
      { slot: 'RB', count: 2 },
      { slot: 'WR', count: 2 },
      { slot: 'TE', count: 1 },
      { slot: 'FLEX', count: 1 },
      { slot: 'K', count: 1 },
      { slot: 'DEF', count: 1 },
      { slot: 'BN', count: 6 },
      { slot: 'IR', count: 1 }
    ],
    settings: {
      numTeams: 12,
      waiverType: 'faab',
      faabBudget: 100,
      tradeDeadlineWeek: 13,
      playoffStartWeek: 15,
      playoffTeams: 6
    },
    ...overrides
  }
}
```

- [x] **Step 2: Write the failing engine tests**

Create `tests/main/scoring/engine.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { DERIVED_STATS, effectiveScoring, scoreStatLine, statValue } from '@main/scoring/engine'
import { STAT_KEY_INFO } from '@shared/statKeys'
import { rules } from '../../fixtures/rules'

describe('scoreStatLine', () => {
  const rbLine = { rec: 7, rec_yd: 87, rec_td: 1, rush_yd: 12, fum_lost: 1 }

  it('scores a PPR line', () => {
    // 7 + 8.7 + 6 + 1.2 - 2
    expect(scoreStatLine(rbLine, rules(), 'RB')).toBe(20.9)
  })

  it('scores a half-PPR line', () => {
    const r = rules({ scoring: { ...rules().scoring, rec: 0.5 } })
    expect(scoreStatLine(rbLine, r, 'RB')).toBe(17.4)
  })

  it('scores a QB line with a 300-yard bonus', () => {
    const r = rules({ scoring: { pass_yd: 0.04, pass_td: 4, pass_int: -1, bonus_pass_yd_300: 2 } })
    // 13 + 8 - 1 + 2
    expect(scoreStatLine({ pass_yd: 325, pass_td: 2, pass_int: 1 }, r, 'QB')).toBe(22)
    expect(scoreStatLine({ pass_yd: 299, pass_td: 2, pass_int: 1 }, r, 'QB')).toBe(18.96)
  })

  it('applies TE premium via bonus_rec_te', () => {
    const r = rules({ scoring: { rec: 1, bonus_rec_te: 0.5 } })
    expect(scoreStatLine({ rec: 6 }, r, 'TE')).toBe(9)
    expect(scoreStatLine({ rec: 6 }, r, 'WR')).toBe(6)
  })

  it('applies TE premium via positionOverrides', () => {
    const r = rules({ scoring: { rec: 1 }, positionOverrides: { TE: { rec: 1.5 } } })
    expect(scoreStatLine({ rec: 6 }, r, 'TE')).toBe(9)
    expect(scoreStatLine({ rec: 6 }, r, 'WR')).toBe(6)
    expect(scoreStatLine({ rec: 6 }, r, null)).toBe(6)
  })

  it('fires yardage bonuses at the threshold', () => {
    const r = rules({ scoring: { rush_yd: 0.1, bonus_rush_yd_100: 3, bonus_rush_rec_yd_100: 1 } })
    expect(scoreStatLine({ rush_yd: 99 }, r, 'RB')).toBe(9.9)
    expect(scoreStatLine({ rush_yd: 100 }, r, 'RB')).toBe(14)
    expect(scoreStatLine({ rush_yd: 60, rec_yd: 45 }, r, 'RB')).toBe(7)
  })

  it('scores kicker distance buckets', () => {
    const r = rules({
      scoring: {
        xpm: 1,
        fgm_0_19: 3,
        fgm_20_29: 3,
        fgm_30_39: 3,
        fgm_40_49: 4,
        fgm_50p: 5,
        fgmiss_0_19: -1
      }
    })
    // 3 + 3 + 4 + 10
    expect(scoreStatLine({ xpm: 3, fgm_30_39: 1, fgm_40_49: 1, fgm_50p: 2 }, r, 'K')).toBe(20)
  })

  it('scores team defense points-allowed tiers', () => {
    const r = rules({
      scoring: {
        sack: 1,
        int: 2,
        def_td: 6,
        pts_allow_0: 10,
        pts_allow_1_6: 7,
        pts_allow_7_13: 4,
        pts_allow_14_20: 1,
        pts_allow_21_27: 0,
        pts_allow_28_34: -1,
        pts_allow_35p: -4
      }
    })
    expect(scoreStatLine({ sack: 3, int: 1, pts_allow: 10 }, r, 'DEF')).toBe(9)
    expect(scoreStatLine({ sack: 3, int: 1, pts_allow: 0 }, r, 'DEF')).toBe(15)
    expect(scoreStatLine({ sack: 3, int: 1, pts_allow: 24 }, r, 'DEF')).toBe(5)
    expect(scoreStatLine({ sack: 3, int: 1, pts_allow: 41 }, r, 'DEF')).toBe(1)
    // no pts_allow in the line (offensive player) → no tier fires
    expect(scoreStatLine({ sack: 3, int: 1 }, r, 'DEF')).toBe(5)
  })

  it('scores yards-allowed tiers and per-yard', () => {
    const r = rules({ scoring: { yds_allow_0_100: 5, yds_allow_100_199: 3, yds_allow: -0.01 } })
    expect(scoreStatLine({ yds_allow: 99 }, r, 'DEF')).toBe(4.01)
    expect(scoreStatLine({ yds_allow: 100 }, r, 'DEF')).toBe(2)
  })

  it('scores unknown or unsupported keys as 0 and ignores stats without a rule', () => {
    const r = rules({ scoring: { def_3_and_out: 1, rec: 1 } })
    expect(scoreStatLine({ rec: 2, rush_yd: 500 }, r, 'WR')).toBe(2)
  })

  it('rounds to 2 decimals', () => {
    const r = rules({ scoring: { rec_yd: 0.1 } })
    expect(scoreStatLine({ rec_yd: 3 }, r, 'WR')).toBe(0.3)
  })
})

describe('effectiveScoring / statValue', () => {
  it('merges position overrides over base scoring', () => {
    const r = rules({ scoring: { rec: 1, rec_yd: 0.1 }, positionOverrides: { TE: { rec: 1.5 } } })
    expect(effectiveScoring(r, 'TE')).toEqual({ rec: 1.5, rec_yd: 0.1 })
    expect(effectiveScoring(r, 'RB')).toEqual({ rec: 1, rec_yd: 0.1 })
  })

  it('reads raw keys directly and derives bonus keys', () => {
    expect(statValue('rec', { rec: 4 }, 'WR')).toBe(4)
    expect(statValue('rec', {}, 'WR')).toBe(0)
    expect(statValue('bonus_rec_yd_100', { rec_yd: 120 }, 'WR')).toBe(1)
    expect(statValue('bonus_rec_rb', { rec: 5 }, 'RB')).toBe(5)
    expect(statValue('bonus_rec_rb', { rec: 5 }, 'WR')).toBe(0)
  })

  it('every derived key is a supported catalogue entry', () => {
    for (const key of Object.keys(DERIVED_STATS)) {
      expect(STAT_KEY_INFO.get(key)?.supported, key).toBe(true)
    }
  })
})
```

- [x] **Step 3: Run the tests to verify they fail**

Run: `source ~/.nvm/nvm.sh && nvm use && npx vitest run tests/main/scoring/engine.test.ts`
Expected: FAIL — `Failed to resolve import "@main/scoring/engine"`.

- [x] **Step 4: Implement the engine**

Create `src/main/scoring/engine.ts`:

```ts
import type { Position, Rules, StatKey } from '@shared/rules'

/** Raw per-game stats keyed by Sleeper stat key, as produced by the nflverse adapters (Plan C). */
export type StatLine = Partial<Record<StatKey, number>>

type Derived = (line: StatLine, position: Position | null) => number

function inRange(value: number | undefined, min: number, max = Infinity): number {
  return value !== undefined && value >= min && value <= max ? 1 : 0
}

function forPosition(line: StatLine, stat: StatKey, position: Position | null, only: Position): number {
  return position === only ? (line[stat] ?? 0) : 0
}

function sum(line: StatLine, ...keys: StatKey[]): number {
  return keys.reduce((total, key) => total + (line[key] ?? 0), 0)
}

/**
 * Stat keys that are not read from the line but computed from it. Thresholds follow the
 * spec (`bonus_*_100` fires at >= 100); points/yards-allowed tiers are inclusive ranges.
 */
export const DERIVED_STATS: Partial<Record<StatKey, Derived>> = {
  bonus_pass_yd_300: (l) => inRange(l.pass_yd, 300),
  bonus_pass_yd_400: (l) => inRange(l.pass_yd, 400),
  bonus_rush_yd_100: (l) => inRange(l.rush_yd, 100),
  bonus_rush_yd_200: (l) => inRange(l.rush_yd, 200),
  bonus_rec_yd_100: (l) => inRange(l.rec_yd, 100),
  bonus_rec_yd_200: (l) => inRange(l.rec_yd, 200),
  bonus_rush_rec_yd_100: (l) => inRange(sum(l, 'rush_yd', 'rec_yd'), 100),
  bonus_rush_rec_yd_200: (l) => inRange(sum(l, 'rush_yd', 'rec_yd'), 200),
  bonus_pass_cmp_25: (l) => inRange(l.pass_cmp, 25),
  bonus_rush_att_20: (l) => inRange(l.rush_att, 20),
  bonus_rec_te: (l, p) => forPosition(l, 'rec', p, 'TE'),
  bonus_rec_rb: (l, p) => forPosition(l, 'rec', p, 'RB'),
  bonus_rec_wr: (l, p) => forPosition(l, 'rec', p, 'WR'),
  pts_allow_0: (l) => inRange(l.pts_allow, 0, 0),
  pts_allow_1_6: (l) => inRange(l.pts_allow, 1, 6),
  pts_allow_7_13: (l) => inRange(l.pts_allow, 7, 13),
  pts_allow_14_20: (l) => inRange(l.pts_allow, 14, 20),
  pts_allow_21_27: (l) => inRange(l.pts_allow, 21, 27),
  pts_allow_28_34: (l) => inRange(l.pts_allow, 28, 34),
  pts_allow_35p: (l) => inRange(l.pts_allow, 35),
  yds_allow_0_100: (l) => inRange(l.yds_allow, 0, 99),
  yds_allow_100_199: (l) => inRange(l.yds_allow, 100, 199),
  yds_allow_200_299: (l) => inRange(l.yds_allow, 200, 299),
  yds_allow_300_349: (l) => inRange(l.yds_allow, 300, 349),
  yds_allow_350_399: (l) => inRange(l.yds_allow, 350, 399),
  yds_allow_400_449: (l) => inRange(l.yds_allow, 400, 449),
  yds_allow_450_499: (l) => inRange(l.yds_allow, 450, 499),
  yds_allow_500_549: (l) => inRange(l.yds_allow, 500, 549),
  yds_allow_550p: (l) => inRange(l.yds_allow, 550)
}

/** Base scoring with the position's overrides applied on top. */
export function effectiveScoring(rules: Rules, position: Position | null): Record<StatKey, number> {
  const override = position ? rules.positionOverrides[position] : undefined
  return override ? { ...rules.scoring, ...override } : rules.scoring
}

/** The quantity a scoring key multiplies: the raw stat, or the derived value for bonus/tier keys. */
export function statValue(key: StatKey, line: StatLine, position: Position | null): number {
  const derived = DERIVED_STATS[key]
  return derived ? derived(line, position) : (line[key] ?? 0)
}

export function scoreStatLine(line: StatLine, rules: Rules, position: Position | null): number {
  let total = 0
  for (const [key, points] of Object.entries(effectiveScoring(rules, position))) {
    if (!points) continue
    total += statValue(key, line, position) * points
  }
  return Math.round(total * 100) / 100
}
```

- [x] **Step 5: Run the tests to verify they pass**

Run: `source ~/.nvm/nvm.sh && nvm use && npx vitest run tests/main/scoring/engine.test.ts`
Expected: `14 passed`.

- [x] **Step 6: Typecheck, lint, commit**

```bash
source ~/.nvm/nvm.sh && nvm use && npm run typecheck && npm run lint && npm test
```
Expected: clean.

```bash
git add -A && git commit -q -m "feat(scoring): add pure stat-line scoring engine

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Migration 002 and the rules repository

**Files:**
- Create: `src/main/db/migrations/002_rules.sql`, `src/main/db/repos/rules.ts`, `tests/main/db/rulesRepo.test.ts`
- Modify: `src/main/db/migrations/index.ts`, `tests/main/db/migrate.test.ts`

**Interfaces:**
- Consumes: `Db`, `withTransaction` (`@main/db/connection`); `migrate` (`@main/db/migrate`); `upsertLeague` (`@main/db/repos/leagues`); `Rules` types.
- Produces: `saveRules(db: Db, leagueId: string, rules: Rules): void` (replaces all rows for the league; **caller wraps in a transaction**); `getRules(db: Db, leagueId: string): Rules | null`.

- [x] **Step 1: Update the migration test and write the failing repo tests**

In `tests/main/db/migrate.test.ts`, change `expect(version).toBe(1)` to `expect(version).toBe(2)` and add `'rules', 'scoring_rules', 'roster_slots'` to the `arrayContaining([...])` list. In the `is idempotent` case change `expect(row.n).toBe(1)` to `expect(row.n).toBe(2)`.

Create `tests/main/db/rulesRepo.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { openDatabase, withTransaction, type Db } from '@main/db/connection'
import { migrate } from '@main/db/migrate'
import { upsertLeague } from '@main/db/repos/leagues'
import { getRules, saveRules } from '@main/db/repos/rules'
import { rules } from '../../fixtures/rules'

const T = '2026-09-17T12:00:00.000Z'

describe('rules repo', () => {
  let db: Db

  beforeEach(() => {
    db = openDatabase(':memory:')
    migrate(db)
    upsertLeague(
      db,
      {
        leagueId: 'L1',
        name: 'L',
        season: '2026',
        status: 'in_season',
        totalRosters: 12,
        syncedAt: null,
        sleeperRaw: '{}'
      },
      T
    )
  })

  it('returns null when no rules are stored', () => {
    expect(getRules(db, 'L1')).toBeNull()
  })

  it('round-trips scoring, overrides, slots and settings', () => {
    const r = rules({ positionOverrides: { TE: { rec: 1.5 }, RB: { rec: 0.5, rec_yd: 0.2 } } })
    withTransaction(db, () => saveRules(db, 'L1', r))
    expect(getRules(db, 'L1')).toEqual(r)
  })

  it('replaces rows on save (removed keys, slots and overrides disappear)', () => {
    withTransaction(db, () =>
      saveRules(db, 'L1', rules({ positionOverrides: { TE: { rec: 1.5 } } }))
    )
    const next = rules({
      source: 'custom',
      updatedAt: '2026-09-18T00:00:00.000Z',
      scoring: { rec: 0.5 },
      rosterSlots: [{ slot: 'QB', count: 1 }],
      settings: { numTeams: 10, waiverType: 'priority' }
    })
    withTransaction(db, () => saveRules(db, 'L1', next))
    expect(getRules(db, 'L1')).toEqual(next)
  })

  it('keeps roster slot order', () => {
    const r = rules({
      rosterSlots: [
        { slot: 'WR', count: 3 },
        { slot: 'BN', count: 5 },
        { slot: 'QB', count: 1 }
      ]
    })
    withTransaction(db, () => saveRules(db, 'L1', r))
    expect(getRules(db, 'L1')?.rosterSlots.map((s) => s.slot)).toEqual(['WR', 'BN', 'QB'])
  })

  it('requires the league row', () => {
    expect(() => saveRules(db, 'nope', rules())).toThrow(/FOREIGN KEY/)
  })
})
```

- [x] **Step 2: Run the tests to verify they fail**

Run: `source ~/.nvm/nvm.sh && nvm use && npx vitest run tests/main/db`
Expected: FAIL — migrate test expects version 2 (gets 1); rules repo test cannot resolve `@main/db/repos/rules`.

- [x] **Step 3: Write the migration**

Create `src/main/db/migrations/002_rules.sql`:

```sql
CREATE TABLE rules (
  league_id TEXT PRIMARY KEY REFERENCES leagues(league_id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK (source IN ('sleeper', 'custom')),
  settings_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- position = '' means "all positions"; a named position is an override.
CREATE TABLE scoring_rules (
  league_id TEXT NOT NULL REFERENCES leagues(league_id) ON DELETE CASCADE,
  stat_key TEXT NOT NULL,
  position TEXT NOT NULL DEFAULT '',
  points REAL NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (league_id, stat_key, position)
);

CREATE TABLE roster_slots (
  league_id TEXT NOT NULL REFERENCES leagues(league_id) ON DELETE CASCADE,
  slot TEXT NOT NULL,
  count INTEGER NOT NULL,
  ordinal INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (league_id, slot)
);
```

Replace `src/main/db/migrations/index.ts` with:

```ts
import initial from './001_initial.sql?raw'
import rulesSql from './002_rules.sql?raw'

export interface Migration {
  version: number
  name: string
  sql: string
}

export const migrations: Migration[] = [
  { version: 1, name: 'initial', sql: initial },
  { version: 2, name: 'rules', sql: rulesSql }
]
```

- [x] **Step 4: Write the repository**

Create `src/main/db/repos/rules.ts`:

```ts
import type { LeagueSettings, Position, Rules, RulesSource, StatKey } from '@shared/rules'
import type { Db } from '../connection'

const ALL_POSITIONS = ''

interface RulesRow {
  source: RulesSource
  settings_json: string
  updated_at: string
}

interface ScoringRow {
  stat_key: string
  position: string
  points: number
}

interface SlotRow {
  slot: string
  count: number
}

/** Replaces every rules row for the league. Wrap in `withTransaction`. */
export function saveRules(db: Db, leagueId: string, rules: Rules): void {
  const ts = rules.updatedAt
  db.prepare(
    `INSERT INTO rules (league_id, source, settings_json, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(league_id) DO UPDATE SET source = excluded.source,
       settings_json = excluded.settings_json, updated_at = excluded.updated_at`
  ).run(leagueId, rules.source, JSON.stringify(rules.settings), ts)

  db.prepare('DELETE FROM scoring_rules WHERE league_id = ?').run(leagueId)
  const insertScore = db.prepare(
    'INSERT INTO scoring_rules (league_id, stat_key, position, points, updated_at) VALUES (?, ?, ?, ?, ?)'
  )
  for (const [key, points] of Object.entries(rules.scoring)) {
    insertScore.run(leagueId, key, ALL_POSITIONS, points, ts)
  }
  for (const [position, overrides] of Object.entries(rules.positionOverrides)) {
    for (const [key, points] of Object.entries(overrides ?? {})) {
      insertScore.run(leagueId, key, position, points, ts)
    }
  }

  db.prepare('DELETE FROM roster_slots WHERE league_id = ?').run(leagueId)
  const insertSlot = db.prepare(
    'INSERT INTO roster_slots (league_id, slot, count, ordinal, updated_at) VALUES (?, ?, ?, ?, ?)'
  )
  rules.rosterSlots.forEach((s, i) => insertSlot.run(leagueId, s.slot, s.count, i, ts))
}

export function getRules(db: Db, leagueId: string): Rules | null {
  const head = db
    .prepare('SELECT source, settings_json, updated_at FROM rules WHERE league_id = ?')
    .get(leagueId) as RulesRow | undefined
  if (!head) return null

  const scoring: Record<StatKey, number> = {}
  const positionOverrides: Rules['positionOverrides'] = {}
  const scoringRows = db
    .prepare(
      'SELECT stat_key, position, points FROM scoring_rules WHERE league_id = ? ORDER BY stat_key'
    )
    .all(leagueId) as ScoringRow[]
  for (const row of scoringRows) {
    if (row.position === ALL_POSITIONS) scoring[row.stat_key] = row.points
    else (positionOverrides[row.position as Position] ??= {})[row.stat_key] = row.points
  }

  const rosterSlots = (
    db
      .prepare('SELECT slot, count FROM roster_slots WHERE league_id = ? ORDER BY ordinal')
      .all(leagueId) as SlotRow[]
  ).map((r) => ({ slot: r.slot, count: r.count }))

  return {
    source: head.source,
    updatedAt: head.updated_at,
    scoring,
    positionOverrides,
    rosterSlots,
    settings: JSON.parse(head.settings_json) as LeagueSettings
  }
}
```

- [x] **Step 5: Run the tests to verify they pass**

Run: `source ~/.nvm/nvm.sh && nvm use && npx vitest run tests/main/db`
Expected: all pass (migrate: 4, repos: existing, rulesRepo: 5).

- [x] **Step 6: Typecheck, lint, commit**

```bash
source ~/.nvm/nvm.sh && nvm use && npm run typecheck && npm run lint && npm test
```
Expected: clean.

```bash
git add -A && git commit -q -m "feat(db): add rules tables and repository

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Rules in the Sleeper sync + explicit re-import

**Files:**
- Modify: `src/main/sync/sleeperSync.ts`, `tests/main/sync/sleeperSync.test.ts`

**Interfaces:**
- Consumes: `getRules`, `saveRules` (`@main/db/repos/rules`); `mapRules` (`./mappers`); `startSync`, `finishSync` (`@main/db/repos/syncLog`); existing `SyncDeps`, `nowOf`, `withTransaction`.
- Produces: `SOURCE_RULES = 'sleeper:rules'`; `reimportRules(deps: SyncDeps, leagueId: string): Promise<Rules>` — fetches the league, overwrites rules unconditionally, logs one `sync_log` row, rethrows on failure. `syncLeague` now writes Sleeper rules when none exist or `source === 'sleeper'`.

- [x] **Step 1: Write the failing sync tests**

In `tests/main/sync/sleeperSync.test.ts`, change these existing import lines and add the two new ones:

```ts
import { openDatabase, withTransaction, type Db } from '@main/db/connection'
import { getRules, saveRules } from '@main/db/repos/rules'
import { getLastError, getLastSync } from '@main/db/repos/syncLog'
import {
  importLeague,
  refreshSleeper,
  reimportRules,
  SOURCE_LEAGUE,
  SOURCE_PLAYERS,
  SOURCE_RULES,
  SOURCE_STATE
} from '@main/sync/sleeperSync'
import { rules } from '../../fixtures/rules'
```

Then append inside `describe('sleeper sync', …)`:

```ts
  describe('rules', () => {
    const halfPpr = (): SleeperClient =>
      fakeClient({
        getLeague: vi.fn(async () => ({
          ...fx.league,
          scoring_settings: { ...fx.league.scoring_settings, rec: 0.5 }
        }))
      })

    it('importLeague writes Sleeper-sourced rules', async () => {
      await importLeague({ db, sleeper: fakeClient(), now }, 'L1', 'u1')
      const r = getRules(db, 'L1')
      expect(r?.source).toBe('sleeper')
      expect(r?.scoring.rec).toBe(1)
      expect(r?.rosterSlots).toContainEqual({ slot: 'BN', count: 6 })
      expect(r?.settings.numTeams).toBe(2)
    })

    it('refresh updates rules that are still Sleeper-sourced', async () => {
      await importLeague({ db, sleeper: fakeClient(), now }, 'L1', 'u1')
      await refreshSleeper({ db, sleeper: halfPpr(), now }, { force: true })
      expect(getRules(db, 'L1')?.scoring.rec).toBe(0.5)
    })

    it('refresh never overwrites custom rules', async () => {
      await importLeague({ db, sleeper: fakeClient(), now }, 'L1', 'u1')
      withTransaction(db, () =>
        saveRules(db, 'L1', rules({ source: 'custom', scoring: { rec: 2 } }))
      )
      await refreshSleeper({ db, sleeper: halfPpr(), now }, { force: true })
      expect(getRules(db, 'L1')).toMatchObject({ source: 'custom', scoring: { rec: 2 } })
    })

    it('reimportRules overwrites custom rules and logs the step', async () => {
      await importLeague({ db, sleeper: fakeClient(), now }, 'L1', 'u1')
      withTransaction(db, () =>
        saveRules(db, 'L1', rules({ source: 'custom', scoring: { rec: 2 } }))
      )
      const result = await reimportRules({ db, sleeper: halfPpr(), now }, 'L1')
      expect(result.source).toBe('sleeper')
      expect(result.scoring.rec).toBe(0.5)
      expect(getRules(db, 'L1')).toEqual(result)
      expect(getLastSync(db, SOURCE_RULES)?.status).toBe('ok')
    })

    it('reimportRules throws and logs an error when the league is gone', async () => {
      await importLeague({ db, sleeper: fakeClient(), now }, 'L1', 'u1')
      const client = fakeClient({ getLeague: vi.fn(async () => null) })
      await expect(reimportRules({ db, sleeper: client, now }, 'L1')).rejects.toThrow(
        'League L1 not found on Sleeper'
      )
      expect(getLastSync(db, SOURCE_RULES)?.status).toBe('error')
      expect(getRules(db, 'L1')?.scoring.rec).toBe(1)
    })
  })
```

- [x] **Step 2: Run the tests to verify they fail**

Run: `source ~/.nvm/nvm.sh && nvm use && npx vitest run tests/main/sync/sleeperSync.test.ts`
Expected: FAIL — `reimportRules` / `SOURCE_RULES` not exported; the first case fails with `getRules` returning `null`.

- [x] **Step 3: Implement**

In `src/main/sync/sleeperSync.ts`:

Add imports:

```ts
import { getRules, saveRules } from '@main/db/repos/rules'
import type { Rules } from '@shared/rules'
```

extend the `./mappers` import with `mapRules`, and add after `SOURCE_PLAYERS`:

```ts
export const SOURCE_RULES = 'sleeper:rules'
```

In `syncLeague`, replace the `withTransaction` block with:

```ts
    withTransaction(deps.db, () => {
      upsertLeague(deps.db, mapLeague(league, ts), ts)
      replaceTeams(deps.db, leagueId, teams, ts)
      replaceRosterPlayers(deps.db, leagueId, rosterPlayers, ts)
      // custom rules belong to the user; only Sleeper-sourced rules follow the commissioner
      if (getRules(deps.db, leagueId)?.source !== 'custom') {
        saveRules(deps.db, leagueId, mapRules(league, ts))
      }
    })
```

Append at the end of the file:

```ts
/** Explicit "Re-import from Sleeper": overwrites whatever rules exist, including custom ones. */
export async function reimportRules(deps: SyncDeps, leagueId: string): Promise<Rules> {
  const id = startSync(deps.db, SOURCE_RULES, nowOf(deps).toISOString())
  try {
    const league = await deps.sleeper.getLeague(leagueId)
    if (!league) throw new Error(`League ${leagueId} not found on Sleeper`)
    const rules = mapRules(league, nowOf(deps).toISOString())
    withTransaction(deps.db, () => saveRules(deps.db, leagueId, rules))
    finishSync(
      deps.db,
      id,
      'ok',
      nowOf(deps).toISOString(),
      null,
      Object.keys(rules.scoring).length
    )
    return rules
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    finishSync(deps.db, id, 'error', nowOf(deps).toISOString(), message, 0)
    throw err
  }
}
```

- [x] **Step 4: Run the tests to verify they pass**

Run: `source ~/.nvm/nvm.sh && nvm use && npx vitest run tests/main/sync/sleeperSync.test.ts`
Expected: all pass (existing cases + 5 new).

- [x] **Step 5: Typecheck, lint, commit**

```bash
source ~/.nvm/nvm.sh && nvm use && npm run typecheck && npm run lint && npm test
```
Expected: clean.

```bash
git add -A && git commit -q -m "feat(sync): import rules from sleeper, add re-import

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Rules validation, IPC contract, preload and handlers

**Files:**
- Create: `src/main/scoring/normalize.ts`, `tests/main/scoring/normalize.test.ts`
- Modify: `src/shared/ipc.ts`, `src/preload/index.ts`, `src/main/ipc/handlers.ts`

**Interfaces:**
- Consumes: `saveRules`, `getRules`; `reimportRules`, `syncDeps`; `withTransaction`; `POSITIONS`, `roundPoints`, `Rules`, `LeagueSettings`.
- Produces: `normalizeRules(input: Rules, updatedAt: string): Rules` (throws `Error` with a user-readable message on invalid input; always returns `source: 'custom'`); `Api.rules.{get, update, reimportFromSleeper}`; channels `IPC.rulesGet = 'rules:get'`, `IPC.rulesUpdate = 'rules:update'`, `IPC.rulesReimport = 'rules:reimport'`.

- [x] **Step 1: Write the failing normalize tests**

Create `tests/main/scoring/normalize.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { normalizeRules } from '@main/scoring/normalize'
import { rules } from '../../fixtures/rules'

const T = '2026-09-18T00:00:00.000Z'

describe('normalizeRules', () => {
  it('stamps source=custom and updatedAt, rounds points, drops empty overrides', () => {
    const out = normalizeRules(
      rules({
        scoring: { rec: 1.00004, rec_yd: 0.1 },
        positionOverrides: { TE: { rec: 1.5 }, RB: {} }
      }),
      T
    )
    expect(out.source).toBe('custom')
    expect(out.updatedAt).toBe(T)
    expect(out.scoring).toEqual({ rec: 1, rec_yd: 0.1 })
    expect(out.positionOverrides).toEqual({ TE: { rec: 1.5 } })
    expect(out.rosterSlots).toEqual(rules().rosterSlots)
    expect(out.settings).toEqual(rules().settings)
  })

  it('normalizes slot names', () => {
    const out = normalizeRules(rules({ rosterSlots: [{ slot: ' flex ', count: 2 }] }), T)
    expect(out.rosterSlots).toEqual([{ slot: 'FLEX', count: 2 }])
  })

  it('drops undefined optional settings', () => {
    const out = normalizeRules(
      rules({ settings: { numTeams: 10, waiverType: 'priority', faabBudget: undefined } }),
      T
    )
    expect(out.settings).toEqual({ numTeams: 10, waiverType: 'priority' })
  })

  it('rejects invalid input with a readable message', () => {
    expect(() => normalizeRules(rules({ scoring: { rec: Number.NaN } }), T)).toThrow(
      'scoring.rec: points must be a number'
    )
    expect(() =>
      normalizeRules(rules({ positionOverrides: { XX: { rec: 1 } } as never }), T)
    ).toThrow('Unknown position "XX"')
    expect(() => normalizeRules(rules({ rosterSlots: [{ slot: 'RB', count: -1 }] }), T)).toThrow(
      'Slot RB count must be a whole number >= 0'
    )
    expect(() => normalizeRules(rules({ rosterSlots: [{ slot: 'RB', count: 1.5 }] }), T)).toThrow(
      'Slot RB count must be a whole number >= 0'
    )
    expect(() =>
      normalizeRules(
        rules({
          rosterSlots: [
            { slot: 'RB', count: 1 },
            { slot: 'rb', count: 1 }
          ]
        }),
        T
      )
    ).toThrow('Duplicate roster slot RB')
    expect(() => normalizeRules(rules({ rosterSlots: [{ slot: '', count: 1 }] }), T)).toThrow(
      'Roster slot name is required'
    )
    expect(() =>
      normalizeRules(rules({ settings: { numTeams: 1, waiverType: 'faab' } }), T)
    ).toThrow('Number of teams must be a whole number >= 2')
    expect(() =>
      normalizeRules(rules({ settings: { numTeams: 12, waiverType: 'auction' as never } }), T)
    ).toThrow('Waiver type must be faab or priority')
    expect(() =>
      normalizeRules(rules({ settings: { numTeams: 12, waiverType: 'faab', playoffTeams: -6 } }), T)
    ).toThrow('playoffTeams must be a whole number >= 0')
  })
})
```

- [x] **Step 2: Run the tests to verify they fail**

Run: `source ~/.nvm/nvm.sh && nvm use && npx vitest run tests/main/scoring/normalize.test.ts`
Expected: FAIL — `Failed to resolve import "@main/scoring/normalize"`.

- [x] **Step 3: Implement `normalizeRules`**

Create `src/main/scoring/normalize.ts`:

```ts
import {
  POSITIONS,
  roundPoints,
  type LeagueSettings,
  type Position,
  type Rules,
  type StatKey
} from '@shared/rules'

const OPTIONAL_SETTINGS = ['faabBudget', 'tradeDeadlineWeek', 'playoffStartWeek', 'playoffTeams'] as const

function cleanPoints(obj: unknown, where: string): Record<StatKey, number> {
  if (!obj || typeof obj !== 'object') throw new Error(`${where}: expected an object`)
  const out: Record<StatKey, number> = {}
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new Error(`${where}.${key}: points must be a number`)
    }
    out[key] = roundPoints(value)
  }
  return out
}

function wholeNumber(value: unknown, where: string, min: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min) {
    throw new Error(`${where} must be a whole number >= ${min}`)
  }
  return value
}

/** Validates rules coming from the renderer and stamps them as a custom edit. Throws on invalid input. */
export function normalizeRules(input: Rules, updatedAt: string): Rules {
  const scoring = cleanPoints(input.scoring, 'scoring')

  const positionOverrides: Rules['positionOverrides'] = {}
  for (const [position, overrides] of Object.entries(input.positionOverrides ?? {})) {
    if (!(POSITIONS as readonly string[]).includes(position)) {
      throw new Error(`Unknown position "${position}"`)
    }
    const cleaned = cleanPoints(overrides, `overrides.${position}`)
    if (Object.keys(cleaned).length > 0) positionOverrides[position as Position] = cleaned
  }

  if (!Array.isArray(input.rosterSlots)) throw new Error('rosterSlots: expected a list')
  const seen = new Set<string>()
  const rosterSlots = input.rosterSlots.map(({ slot, count }) => {
    const name = typeof slot === 'string' ? slot.trim().toUpperCase() : ''
    if (!name) throw new Error('Roster slot name is required')
    if (seen.has(name)) throw new Error(`Duplicate roster slot ${name}`)
    seen.add(name)
    return { slot: name, count: wholeNumber(count, `Slot ${name} count`, 0) }
  })

  const s: Partial<LeagueSettings> = input.settings ?? {}
  if (s.waiverType !== 'faab' && s.waiverType !== 'priority') {
    throw new Error('Waiver type must be faab or priority')
  }
  const settings: LeagueSettings = {
    numTeams: wholeNumber(s.numTeams, 'Number of teams', 2),
    waiverType: s.waiverType
  }
  for (const key of OPTIONAL_SETTINGS) {
    const value = s[key]
    if (value === undefined) continue
    settings[key] = wholeNumber(value, key, 0)
  }

  return { source: 'custom', updatedAt, scoring, positionOverrides, rosterSlots, settings }
}
```

- [x] **Step 4: Run the tests to verify they pass**

Run: `source ~/.nvm/nvm.sh && nvm use && npx vitest run tests/main/scoring/normalize.test.ts`
Expected: `4 passed`.

- [x] **Step 5: Extend the IPC contract**

In `src/shared/ipc.ts`, add `import type { Rules } from './rules'`, add to `Api` after `league`:

```ts
  rules: {
    get(): Promise<Rules | null>
    /** Saves as custom rules (source = 'custom'); rejects with a readable message on invalid input. */
    update(rules: Rules): Promise<Rules>
    /** Overwrites the stored rules (custom or not) with the league's current Sleeper settings. */
    reimportFromSleeper(): Promise<Rules>
  }
```

and add to `IPC`:

```ts
  rulesGet: 'rules:get',
  rulesUpdate: 'rules:update',
  rulesReimport: 'rules:reimport',
```

- [x] **Step 6: Extend the preload bridge**

In `src/preload/index.ts`, add to the `api` object after `league`:

```ts
  rules: {
    get: () => ipcRenderer.invoke(IPC.rulesGet),
    update: (rules) => ipcRenderer.invoke(IPC.rulesUpdate, rules),
    reimportFromSleeper: () => ipcRenderer.invoke(IPC.rulesReimport)
  },
```

- [x] **Step 7: Register the handlers**

In `src/main/ipc/handlers.ts`, change the `@main/db/connection` and `@main/sync/sleeperSync` import lines and add three new imports:

```ts
import { withTransaction, type Db } from '@main/db/connection'
import { getRules, saveRules } from '@main/db/repos/rules'
import { normalizeRules } from '@main/scoring/normalize'
import {
  importLeague,
  refreshSleeper,
  reimportRules,
  SOURCE_LEAGUE,
  type SyncDeps
} from '@main/sync/sleeperSync'
import type { Rules } from '@shared/rules'
```

and add before the `IPC.syncRefresh` handler:

```ts
  ipcMain.handle(IPC.rulesGet, (): Rules | null => {
    const id = activeLeagueId()
    return id ? getRules(ctx.db, id) : null
  })

  ipcMain.handle(IPC.rulesUpdate, (_event, input: Rules): Rules => {
    const id = activeLeagueId()
    if (!id) throw new Error('No league imported')
    const rules = normalizeRules(input, new Date().toISOString())
    withTransaction(ctx.db, () => saveRules(ctx.db, id, rules))
    // Plan C: recomputePoints(ctx.db, id) goes here (spec §7: rules change → rebuild player_week_points)
    return rules
  })

  ipcMain.handle(IPC.rulesReimport, (): Promise<Rules> => {
    const id = activeLeagueId()
    if (!id) throw new Error('No league imported')
    return reimportRules(syncDeps(ctx), id)
  })
```

- [x] **Step 8: Typecheck, lint, test, commit**

```bash
source ~/.nvm/nvm.sh && nvm use && npm run typecheck && npm run lint && npm test
```
Expected: clean (typecheck covers the preload's `Api` conformance).

```bash
git add -A && git commit -q -m "feat(ipc): expose rules get, update and re-import

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Rules screen

**Files:**
- Create: `src/renderer/src/lib/rulesView.ts`, `tests/renderer/lib/rulesView.test.ts`, `src/renderer/src/screens/RulesScreen.tsx`
- Modify: `src/renderer/src/components/Sidebar.tsx`, `src/renderer/src/App.tsx`

**Interfaces:**
- Consumes: `api.rules.*`; `Rules`, `Position`, `StatKey`, `LeagueSettings`, `WaiverType`, `KNOWN_SLOTS`, `RosterSlotCount` (`@shared/rules`); `STAT_KEYS`, `STAT_KEY_INFO`, `STAT_CATEGORIES`, `StatCategory`, `StatKeyInfo` (`@shared/statKeys`); `relativeTime`, `errorMessage` (`@/lib/format`); shadcn `Badge`, `Button`, `Card*`, `Input`, `Table*`.
- Produces: `scoringGroups(scoring): ScoringGroup[]`, `unsupportedKeys(scoring): StatKey[]`, `addableKeys(scoring): StatKeyInfo[]`, `addableSlots(slots): string[]`, `OVERRIDE_POSITIONS`, `isOverridable(category)` (in `@/lib/rulesView`); `RulesScreen()`.

- [x] **Step 1: Write the failing view-model tests**

Create `tests/renderer/lib/rulesView.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  addableKeys,
  addableSlots,
  isOverridable,
  scoringGroups,
  unsupportedKeys
} from '@/lib/rulesView'

describe('rulesView', () => {
  const scoring = { rec_yd: 0.1, rec: 1, pass_td: 4, def_3_and_out: 1, pass_td_40p: 0, sack: 1 }

  it('groups scoring rows by category in catalogue order, unknown keys last', () => {
    const groups = scoringGroups(scoring)
    expect(groups.map((g) => g.category)).toEqual(['passing', 'receiving', 'defense', 'other'])
    expect(groups[0].rows.map((r) => r.key)).toEqual(['pass_td', 'pass_td_40p'])
    expect(groups[1].rows.map((r) => r.key)).toEqual(['rec', 'rec_yd'])
    expect(groups[3].rows).toEqual([
      { key: 'def_3_and_out', label: 'def_3_and_out', category: 'other', points: 1, supported: false }
    ])
    expect(groups[1].rows[0]).toMatchObject({ label: 'Reception', points: 1, supported: true })
  })

  it('lists unsupported keys that carry points', () => {
    expect(unsupportedKeys(scoring)).toEqual(['def_3_and_out'])
  })

  it('offers catalogue keys not yet in scoring', () => {
    const keys = addableKeys(scoring).map((k) => k.key)
    expect(keys).toContain('bonus_rec_te')
    expect(keys).not.toContain('rec')
  })

  it('offers known slots not yet in the roster', () => {
    expect(addableSlots([{ slot: 'QB', count: 1 }, { slot: 'BN', count: 6 }])).toContain('FLEX')
    expect(addableSlots([{ slot: 'QB', count: 1 }])).not.toContain('QB')
  })

  it('allows overrides on offense categories only', () => {
    expect(isOverridable('receiving')).toBe(true)
    expect(isOverridable('bonus')).toBe(true)
    expect(isOverridable('kicking')).toBe(false)
    expect(isOverridable('defense')).toBe(false)
  })
})
```

- [x] **Step 2: Run the tests to verify they fail**

Run: `source ~/.nvm/nvm.sh && nvm use && npx vitest run tests/renderer/lib/rulesView.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/rulesView"`.

- [x] **Step 3: Implement the view-model**

Create `src/renderer/src/lib/rulesView.ts`:

```ts
import { KNOWN_SLOTS, type Position, type RosterSlotCount, type StatKey } from '@shared/rules'
import {
  STAT_CATEGORIES,
  STAT_KEY_INFO,
  STAT_KEYS,
  type StatCategory,
  type StatKeyInfo
} from '@shared/statKeys'

export const OVERRIDE_POSITIONS: Position[] = ['QB', 'RB', 'WR', 'TE']
const OVERRIDABLE: ReadonlySet<StatCategory> = new Set([
  'passing',
  'rushing',
  'receiving',
  'misc',
  'bonus'
])

export function isOverridable(category: StatCategory): boolean {
  return OVERRIDABLE.has(category)
}

export interface ScoringRow {
  key: StatKey
  label: string
  category: StatCategory
  points: number
  supported: boolean
}

export interface ScoringGroup {
  category: StatCategory
  label: string
  rows: ScoringRow[]
}

export function scoringGroups(scoring: Record<StatKey, number>): ScoringGroup[] {
  const known: ScoringRow[] = STAT_KEYS.filter((k) => scoring[k.key] !== undefined).map((k) => ({
    key: k.key,
    label: k.label,
    category: k.category,
    points: scoring[k.key],
    supported: k.supported
  }))
  const unknown: ScoringRow[] = Object.keys(scoring)
    .filter((key) => !STAT_KEY_INFO.has(key))
    .sort()
    .map((key) => ({ key, label: key, category: 'other', points: scoring[key], supported: false }))
  const rows = [...known, ...unknown]
  return STAT_CATEGORIES.map((c) => ({
    category: c.id,
    label: c.label,
    rows: rows.filter((r) => r.category === c.id)
  })).filter((g) => g.rows.length > 0)
}

/** Keys that carry points but cannot be computed from nflverse data. */
export function unsupportedKeys(scoring: Record<StatKey, number>): StatKey[] {
  return Object.entries(scoring)
    .filter(([key, points]) => points !== 0 && !(STAT_KEY_INFO.get(key)?.supported ?? false))
    .map(([key]) => key)
    .sort()
}

export function addableKeys(scoring: Record<StatKey, number>): StatKeyInfo[] {
  return STAT_KEYS.filter((k) => scoring[k.key] === undefined)
}

export function addableSlots(slots: RosterSlotCount[]): string[] {
  const present = new Set(slots.map((s) => s.slot))
  return KNOWN_SLOTS.filter((s) => !present.has(s))
}
```

- [x] **Step 4: Run the tests to verify they pass**

Run: `source ~/.nvm/nvm.sh && nvm use && npx vitest run tests/renderer/lib/rulesView.test.ts`
Expected: `5 passed`.

- [x] **Step 5: Build the screen**

Create `src/renderer/src/screens/RulesScreen.tsx`. Inputs are uncontrolled (`defaultValue`) so partially typed numbers never fight React; the editable area is remounted via `key={version}` whenever the draft is reset.

```tsx
import { Fragment, useCallback, useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table'
import { api } from '@/lib/api'
import { errorMessage, relativeTime } from '@/lib/format'
import {
  addableKeys,
  addableSlots,
  isOverridable,
  OVERRIDE_POSITIONS,
  scoringGroups,
  unsupportedKeys
} from '@/lib/rulesView'
import { cn } from '@/lib/utils'
import type { LeagueSettings, Position, Rules, StatKey, WaiverType } from '@shared/rules'

const selectClass =
  'h-9 rounded-md border border-input bg-transparent px-2 text-sm text-foreground dark:bg-input/30'

interface NumberFieldProps {
  value: number | undefined
  onChange: (value: number | undefined) => void
  placeholder?: string
  integer?: boolean
  className?: string
}

function NumberField({
  value,
  onChange,
  placeholder,
  integer,
  className
}: NumberFieldProps): React.JSX.Element {
  return (
    <Input
      type="number"
      step={integer ? 1 : 'any'}
      defaultValue={value ?? ''}
      placeholder={placeholder}
      onChange={(e) => {
        if (e.target.value === '') return onChange(undefined)
        const v = e.target.valueAsNumber
        if (Number.isFinite(v)) onChange(v)
      }}
      className={cn('h-7 w-20 px-2 text-right text-xs tabular-nums', className)}
    />
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
      {label}
      {children}
    </label>
  )
}

function RemoveButton({ label, onClick }: { label: string; onClick: () => void }): React.JSX.Element {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="text-muted-foreground transition-colors hover:text-destructive"
    >
      <X className="size-3.5" />
    </button>
  )
}

export function RulesScreen(): React.JSX.Element {
  const [saved, setSaved] = useState<Rules | null>(null)
  const [draft, setDraft] = useState<Rules | null>(null)
  const [version, setVersion] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmReimport, setConfirmReimport] = useState(false)

  const adopt = useCallback((rules: Rules): void => {
    setSaved(rules)
    setDraft(rules)
    setVersion((v) => v + 1)
    setConfirmReimport(false)
  }, [])

  useEffect(() => {
    void api.rules
      .get()
      .then((r) => {
        setError(r ? null : 'No rules stored yet — import a league first.')
        if (r) adopt(r)
      })
      .catch((err) => setError(errorMessage(err)))
  }, [adopt])

  const update = (fn: (r: Rules) => Rules): void => setDraft((d) => (d ? fn(d) : d))
  const setPoints = (key: StatKey, points: number): void =>
    update((r) => ({ ...r, scoring: { ...r.scoring, [key]: points } }))
  const removeStat = (key: StatKey): void =>
    update((r) => {
      const scoring = { ...r.scoring }
      delete scoring[key]
      return { ...r, scoring }
    })
  const setOverride = (position: Position, key: StatKey, points: number | undefined): void =>
    update((r) => {
      const current = { ...(r.positionOverrides[position] ?? {}) }
      if (points === undefined) delete current[key]
      else current[key] = points
      const positionOverrides = { ...r.positionOverrides }
      if (Object.keys(current).length === 0) delete positionOverrides[position]
      else positionOverrides[position] = current
      return { ...r, positionOverrides }
    })
  const setSlot = (slot: string, count: number): void =>
    update((r) => ({
      ...r,
      rosterSlots: r.rosterSlots.map((s) => (s.slot === slot ? { ...s, count } : s))
    }))
  const addSlot = (slot: string): void =>
    update((r) => ({ ...r, rosterSlots: [...r.rosterSlots, { slot, count: 1 }] }))
  const removeSlot = (slot: string): void =>
    update((r) => ({ ...r, rosterSlots: r.rosterSlots.filter((s) => s.slot !== slot) }))
  const setSetting = <K extends keyof LeagueSettings>(key: K, value: LeagueSettings[K]): void =>
    update((r) => ({ ...r, settings: { ...r.settings, [key]: value } }))

  async function save(): Promise<void> {
    if (!draft) return
    setBusy(true)
    setError(null)
    try {
      adopt(await api.rules.update(draft))
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function reimport(): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      adopt(await api.rules.reimportFromSleeper())
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  if (!draft || !saved) {
    return <div className="text-sm text-muted-foreground">{error ?? 'Loading…'}</div>
  }

  const dirty = JSON.stringify(draft) !== JSON.stringify(saved)
  const groups = scoringGroups(draft.scoring)
  const unsupported = unsupportedKeys(draft.scoring)
  const addable = addableKeys(draft.scoring)
  const slotsToAdd = addableSlots(draft.rosterSlots)
  const overrideColumns = OVERRIDE_POSITIONS.length

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="mr-auto">
          <h1 className="text-2xl font-semibold">Rules</h1>
          <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
            {saved.source === 'custom' ? (
              <Badge>Customized</Badge>
            ) : (
              <Badge variant="secondary">Imported from Sleeper</Badge>
            )}
            <span>updated {relativeTime(saved.updatedAt)}</span>
          </p>
        </div>
        {dirty && (
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => adopt(saved)}>
            Discard
          </Button>
        )}
        <Button size="sm" disabled={!dirty || busy} onClick={() => void save()}>
          Save
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() =>
            saved.source === 'custom' || dirty ? setConfirmReimport(true) : void reimport()
          }
        >
          Re-import from Sleeper
        </Button>
      </div>

      {confirmReimport && (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm">
          <span className="mr-auto">
            This replaces your customized rules with the league&apos;s current Sleeper settings.
          </span>
          <Button size="sm" variant="destructive" disabled={busy} onClick={() => void reimport()}>
            Overwrite
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setConfirmReimport(false)}>
            Cancel
          </Button>
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      {unsupported.length > 0 && (
        <p className="text-sm text-muted-foreground">
          Not computable from nflverse data (scored as 0):{' '}
          <span className="font-mono text-xs">{unsupported.join(', ')}</span>
        </p>
      )}

      <div key={version} className="space-y-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Scoring</CardTitle>
            <select
              className={selectClass}
              value=""
              onChange={(e) => {
                if (e.target.value) setPoints(e.target.value, 0)
              }}
            >
              <option value="">Add stat…</option>
              {addable.map((k) => (
                <option key={k.key} value={k.key}>
                  {k.label} ({k.key})
                </option>
              ))}
            </select>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Stat</TableHead>
                  <TableHead>Key</TableHead>
                  <TableHead className="text-right">Points</TableHead>
                  {OVERRIDE_POSITIONS.map((p) => (
                    <TableHead key={p} className="text-right">
                      {p}
                    </TableHead>
                  ))}
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {groups.map((g) => (
                  <Fragment key={g.category}>
                    <TableRow className="bg-muted/30 hover:bg-muted/30">
                      <TableCell
                        colSpan={4 + overrideColumns}
                        className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                      >
                        {g.label}
                      </TableCell>
                    </TableRow>
                    {g.rows.map((row) => (
                      <TableRow key={row.key} className={cn(!row.supported && 'opacity-60')}>
                        <TableCell>
                          {row.label}
                          {!row.supported && (
                            <Badge variant="outline" className="ml-2 text-[10px]">
                              unsupported
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {row.key}
                        </TableCell>
                        <TableCell className="text-right">
                          <NumberField
                            value={row.points}
                            onChange={(v) => setPoints(row.key, v ?? 0)}
                          />
                        </TableCell>
                        {OVERRIDE_POSITIONS.map((p) => (
                          <TableCell key={p} className="text-right">
                            {isOverridable(g.category) && (
                              <NumberField
                                value={draft.positionOverrides[p]?.[row.key]}
                                placeholder={String(row.points)}
                                onChange={(v) => setOverride(p, row.key, v)}
                                className="w-16"
                              />
                            )}
                          </TableCell>
                        ))}
                        <TableCell>
                          <RemoveButton
                            label={`Remove ${row.key}`}
                            onClick={() => removeStat(row.key)}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </Fragment>
                ))}
              </TableBody>
            </Table>
            <p className="mt-3 text-xs text-muted-foreground">
              Position columns override the base points for that position; leave blank to inherit.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Roster slots</CardTitle>
            <select
              className={selectClass}
              value=""
              onChange={(e) => {
                if (e.target.value) addSlot(e.target.value)
              }}
            >
              <option value="">Add slot…</option>
              {slotsToAdd.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              {draft.rosterSlots.map((s) => (
                <div key={s.slot} className="flex items-center gap-2 rounded-md border px-3 py-2">
                  <span className="w-24 text-sm font-medium">{s.slot}</span>
                  <NumberField
                    value={s.count}
                    integer
                    onChange={(v) => setSlot(s.slot, v ?? 0)}
                    className="w-14"
                  />
                  <RemoveButton label={`Remove ${s.slot}`} onClick={() => removeSlot(s.slot)} />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">League settings</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <Field label="Teams">
              <NumberField
                value={draft.settings.numTeams}
                integer
                onChange={(v) => setSetting('numTeams', v ?? 0)}
                className="w-full text-left"
              />
            </Field>
            <Field label="Waivers">
              <select
                className={selectClass}
                value={draft.settings.waiverType}
                onChange={(e) => setSetting('waiverType', e.target.value as WaiverType)}
              >
                <option value="faab">FAAB</option>
                <option value="priority">Priority</option>
              </select>
            </Field>
            <Field label="FAAB budget">
              <NumberField
                value={draft.settings.faabBudget}
                integer
                onChange={(v) => setSetting('faabBudget', v)}
                className="w-full text-left"
              />
            </Field>
            <Field label="Trade deadline (week)">
              <NumberField
                value={draft.settings.tradeDeadlineWeek}
                integer
                placeholder="none"
                onChange={(v) => setSetting('tradeDeadlineWeek', v)}
                className="w-full text-left"
              />
            </Field>
            <Field label="Playoffs start (week)">
              <NumberField
                value={draft.settings.playoffStartWeek}
                integer
                onChange={(v) => setSetting('playoffStartWeek', v)}
                className="w-full text-left"
              />
            </Field>
            <Field label="Playoff teams">
              <NumberField
                value={draft.settings.playoffTeams}
                integer
                onChange={(v) => setSetting('playoffTeams', v)}
                className="w-full text-left"
              />
            </Field>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
```

- [x] **Step 6: Enable the screen in the sidebar and App**

In `src/renderer/src/components/Sidebar.tsx`, change the Rules item to `{ id: 'rules', label: 'Rules', icon: BookOpen, enabled: (hasLeague) => hasLeague }` and change the "soon" condition from `!isEnabled && id !== 'league'` to `!isEnabled && id === 'players'`.

In `src/renderer/src/App.tsx`, add `import { RulesScreen } from '@/screens/RulesScreen'` and, after the League line inside `<main>`, add:

```tsx
          {screen === 'rules' && <RulesScreen />}
```

(No `key={dataVersion}` on purpose: a background refresh must not wipe an in-progress edit.)

- [x] **Step 7: Verify, human check, commit**

```bash
source ~/.nvm/nvm.sh && nvm use && npm run typecheck && npm run lint && npm test
```
Expected: clean.

**Human check** (`npx electron-vite dev -- --no-sandbox --disable-gpu --in-process-gpu` under this WSL; plain `npm run dev` on Windows):
1. Sidebar → Rules is enabled once a league is imported. The screen shows the badge `Imported from Sleeper`, a grouped scoring table with your league's keys (Passing, Rushing, Receiving, … with `unsupported` badges where relevant), roster slot chips with counts, and the league settings (teams, waivers, FAAB budget, trade deadline, playoffs).
2. Change `rec` to 0.5 → **Save** enables; click it → badge switches to `Customized`, "updated just now". Restart the app → the value persists and the badge is still `Customized`.
3. Enter `1.5` in the TE column for `rec` → Save → restart → still there. Clear it → Save → gone.
4. "Add stat…" → pick `Per reception (TE)` → a `bonus_rec_te` row appears under Bonuses at 0.
5. Set a slot count to `-1` → Save → red error `Slot … count must be a whole number >= 0`; the draft stays editable.
6. **Re-import from Sleeper** while customized → red confirm bar → **Overwrite** → badge back to `Imported from Sleeper`, `rec` back to your league's value. Status bar shows no error. Pull the network cable (or block the app) and re-import again → error text appears and the status bar shows `sync error`.
7. Refresh (status bar) while `Customized` → values unchanged.

```bash
git add -A && git commit -q -m "feat(ui): add rules screen with editing and re-import

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: Windows build with real data, tag v0.2.0

**Files:**
- Modify: `package.json` (version)

**Interfaces:** none — release verification.

- [x] **Step 1: Bump the version and commit**

```bash
source ~/.nvm/nvm.sh && nvm use && npm version 0.2.0 --no-git-tag-version && git add package.json package-lock.json && git commit -q -m "build: bump version to 0.2.0

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

- [x] **Step 2: Build the Windows installer**

```bash
source ~/.nvm/nvm.sh && nvm use && npm run build:win 2>&1 | tail -5
```
Expected: `dist/FantasyCompanion-Setup-0.2.0.exe` (~90–110 MB). `wine64` + `wine32:i386` are already installed for the NSIS stamping step (see README).

- [x] **Step 3: Human check on Windows**

Install over the existing 0.1.0 install (data in `%APPDATA%\FantasyCompanion\companion.db` is kept; migration 002 runs on first launch). Then:
1. The app opens on the League screen with the existing data; the status bar shows no error.
2. Rules screen shows the real league's scoring imported from Sleeper (compare a few values with Sleeper's league settings page — `pass_yd` 0.04 etc., no float noise).
3. Edit → Save → relaunch → persisted with the `Customized` badge. Re-import → restored.

- [x] **Step 4: Tag**

```bash
git tag -a v0.2.0 -m "Plan B: rules model, scoring engine, rules screen" && git log --oneline -1
```
Expected: the tag points at HEAD. Then append a "Progress notes" section to this plan file (what was verified, any deviations), commit it as `docs(plan): mark plan B complete`.

---

## Self-review notes

- **Spec coverage:** §7 rules model (T1: `Rules`, `StatKey` vocabulary, `positionOverrides`, `rosterSlots`, `settings`); §7 import mapping key-for-key with unknown keys kept, `roster_positions` counts, `settings.*` (T1 `mapRules`); §7 `scoreStatLine` with position overrides and bonus thresholds (T2); §7 "unsupported keys score 0 and are listed on the Rules screen" (T1 catalogue `supported`, T2 engine, T6 notice + badges); §8 `rules` / `scoring_rules` / `roster_slots` tables via a versioned migration (T3); §4 IPC `rules.get / update / reimportFromSleeper` (T5) — `update` marks `source=custom`; recompute is Plan C's hook; §9 sync writes rules on first import (T4); §10 Rules screen with editable scoring, per-position override, roster slot counts, settings, `Imported from Sleeper` / `Customized` badge, re-import warning, unsupported list (T6); §11 re-import logs to `sync_log` and surfaces in the status bar (T4/T5); §12 scoring tests for PPR, half-PPR, TE premium, yardage bonuses, K buckets, DEF tiers (T2), repo idempotency (T3), sync with mocked sources (T4).
- **Deferred to Plan C:** `toStatLine` adapters, `player_week_points`, `recomputePoints` (hook marked in T5), points on League/Players screens, "Stats: not yet" status label.
- **Type consistency:** `Rules.positionOverrides` is `Partial<Record<Position, Record<StatKey, number>>>` in T1, written/read as such in T3 (`position = ''` = base), validated in T5, edited in T6. `saveRules` never opens a transaction — T4 (`syncLeague`, `reimportRules`) and T5 (`rulesUpdate`) wrap it. `reimportRules` returns the same `Rules` it stored (T4 test asserts `getRules` equality). `normalizeRules(input, updatedAt)` and `mapRules(league, updatedAt)` both return `roundPoints`-rounded values so the T6 dirty check compares like with like after a save.

## Progress notes (2026-09-17)

- All 7 tasks implemented inline (executing-plans) on branch `feat/rules-and-scoring`; 81 Vitest tests, typecheck and lint clean at every commit.
- Human checks: rules verified correct against the real league in the WSLg dev app (43 keys, 0 differences from Sleeper's response — confirmed by querying the dev DB); full check incl. install-over-0.1.0, edit/save/relaunch and re-import passed on Windows.
- Windows build: `dist/FantasyCompanion-Setup-0.2.0.exe` (94 MB) built from WSL and copied to the Windows desktop.
- Deviations from the plan text: `.all()` results cast `as unknown as Row[]` (Plan A's pattern; TS rejects the direct cast); the `rulesView` test uses `weird_key` as its unknown-key example because `def_3_and_out` is a catalogued (unsupported) key; Task 3's commit was amended once to include the cast fix; Prettier reflowed a few long lines.
- Confirmed with the user: the editable rules stay (what-if scoring, app-owned points, safety valve).
