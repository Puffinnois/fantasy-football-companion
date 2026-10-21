import { PLAYER_PLAY_COMPONENTS } from './plays'

/**
 * Paired components (`<base>__<when>`): `base` summed only over the weeks where `when` is known.
 *
 * A rate whose numerator and denominator come from sources published days apart (play-by-play the
 * night of a game; snap counts, PFR and ffopportunity a day or two later) must divide one by the
 * other over the same weeks. Until a week's snap counts are out, its routes are unknown; dividing
 * that week's targets by the earlier weeks' routes read 60 % targets per route (Plan AB check,
 * 2026-10-20). So the plays' side of each such rate is also kept as a paired sum.
 */
export const PAIRED: readonly (readonly [base: string, when: string])[] = [
  // Per-route rates (routes: participation, else estimated from snap counts).
  ['targets', 'routes'],
  ['rec_yds', 'routes'],
  ['rec_fd', 'routes'],
  ['tm_dropbacks', 'routes'],
  // PFR's charting over the plays it charted.
  ['pass_att', 'pfr_bad_throws'],
  ['dropbacks', 'pfr_times_pressured'],
  ['carries', 'pfr_rush_btkl'],
  ['receptions', 'pfr_rec_btkl'],
  ['def_pass_snaps', 'pfr_pressures'],
  ['def_pass_snaps', 'pfr_blitzes']
]

export const pairedName = (base: string, when: string): string => `${base}__${when}`

/** Every paired column of `player_week` and `player_season`. */
export const PAIRED_NAMES: readonly string[] = PAIRED.map(([b, w]) => pairedName(b, w))

/**
 * At the play grain, routes are the dropbacks a player was on the field for, so a play pairs with
 * them when participation lists its players. Paired components whose base is a play component and
 * whose `when` is routes are summed from plays under this condition.
 */
export const ON_FIELD_KNOWN =
  'EXISTS (SELECT 1 FROM on_field o WHERE o.game_id = p.game_id AND o.play_id = p.play_id)'

const PLAY_NAMES = new Set(PLAYER_PLAY_COMPONENTS.map((c) => c.name))

/** Paired components the play grain can sum: the paired name → its base play component. */
export const PLAY_PAIRED: ReadonlyMap<string, string> = new Map(
  PAIRED.filter(([base, when]) => when === 'routes' && PLAY_NAMES.has(base)).map(([base, when]) => [
    pairedName(base, when),
    base
  ])
)

/**
 * Fantasy sums paired with ffopportunity's expected points (joined from `fantasy_week` by the
 * engine): points and games in the weeks that have expected points.
 */
export const FANTASY_PAIRED: Readonly<Record<string, string>> = {
  fp__xfp: 'max(CASE WHEN xpoints IS NOT NULL THEN points END)',
  games__xfp: 'max(CASE WHEN xpoints IS NOT NULL THEN 1 END)'
}
