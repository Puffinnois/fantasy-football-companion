import type { Position, Rules, StatKey } from '@shared/rules'

/** Raw per-game stats keyed by Sleeper stat key, as produced by the nflverse adapters (Plan C). */
export type StatLine = Partial<Record<StatKey, number>>

type Derived = (line: StatLine, position: Position | null) => number

function inRange(value: number | undefined, min: number, max = Infinity): number {
  return value !== undefined && value >= min && value <= max ? 1 : 0
}

function forPosition(
  line: StatLine,
  stat: StatKey,
  position: Position | null,
  only: Position
): number {
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
