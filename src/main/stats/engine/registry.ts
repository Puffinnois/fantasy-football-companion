import { CATALOGUE, componentsOf } from '@shared/stats/catalogue'
import { sampleLabel } from '@shared/stats/samples'
import type { Entity, Grain, MetricDef, MetricInfo, MetricStability } from '@shared/stats/types'
import { FANTASY_PAIRED, PLAY_PAIRED } from '../derived/paired'
import { BOX_COMPONENTS, playerComponentNames } from '../derived/player'
import { PLAYER_PLAY_COMPONENTS, TEAM_PLAY_COMPONENTS } from '../derived/plays'
import { TEAM_BOX_COMPONENTS, teamComponentNames } from '../derived/team'
import { PLAYER_MODEL_SUMS, PLAYER_STATES, TEAM_MODEL_SUMS, TEAM_STATES } from '../models/columns'

/**
 * Fantasy components, joined from `fantasy_week` / `team_fantasy_week` under the chosen scoring;
 * `fp__xfp` and `games__xfp` are the points and games of the weeks that have expected points.
 */
export const PLAYER_FANTASY = ['fp', 'xfp', 'boom', 'bust', ...Object.keys(FANTASY_PAIRED)]
export const TEAM_FANTASY = ['fpa_qb', 'fpa_rb', 'fpa_wr', 'fpa_te', 'fpa_k']
/** Weekly quantiles of the fantasy points (spec §8.5 ceiling and floor): weekly rows only. */
export const QUANTILES: Record<string, number> = { 'p80:fp': 0.8, 'p20:fp': 0.2 }

/** Model sums, joined like the fantasy components, by entity. */
export const MODEL_SUMS: Record<Entity, readonly string[]> = {
  player: PLAYER_MODEL_SUMS,
  team: TEAM_MODEL_SUMS
}
/** Model states (`{last:name}`), by entity. */
export const STATES: Record<Entity, readonly string[]> = {
  player: PLAYER_STATES,
  team: TEAM_STATES
}

/**
 * Components that count something every game has a record of (play-by-play, the box score): a
 * player without such a play that week has none, so a missing value sums as 0. FTN, participation,
 * NGS, PFR and QBR components stay NULL when missing: there, NULL means "not measured".
 */
export const ZERO_WHEN_MISSING: Record<Entity, ReadonlySet<string>> = {
  player: new Set([
    ...PLAYER_PLAY_COMPONENTS.filter((c) => c.group === 'pbp').map((c) => c.name),
    ...Object.keys(BOX_COMPONENTS),
    'games'
  ]),
  team: new Set([
    ...TEAM_PLAY_COMPONENTS.filter((c) => c.group === 'pbp').flatMap((c) => [
      `off_${c.name}`,
      `def_${c.name}`
    ]),
    ...Object.keys(TEAM_BOX_COMPONENTS),
    'games'
  ])
}

/** The components each grain can sum, by entity (spec §7.2: the grain decides the tables). */
export const COMPONENTS: Record<Entity, Record<'table' | 'play', ReadonlySet<string>>> = {
  player: {
    table: new Set([
      ...playerComponentNames(),
      ...PLAYER_FANTASY,
      ...PLAYER_MODEL_SUMS,
      ...PLAYER_STATES.map((s) => `last:${s}`),
      ...Object.keys(QUANTILES)
    ]),
    play: new Set([...PLAYER_PLAY_COMPONENTS.map((c) => c.name), ...PLAY_PAIRED.keys(), 'games'])
  },
  team: {
    table: new Set([
      ...teamComponentNames(),
      ...TEAM_FANTASY,
      ...TEAM_MODEL_SUMS,
      ...TEAM_STATES.map((s) => `last:${s}`)
    ]),
    play: new Set([
      ...TEAM_PLAY_COMPONENTS.flatMap((c) => [`off_${c.name}`, `def_${c.name}`]),
      'games'
    ])
  }
}

/**
 * Where a metric can be computed: week and season from the derived tables (weekly quantiles at the
 * week grain only); play when every component comes from plays (and it does not depend on the
 * scoring).
 */
export function grainsOf(def: MetricDef): Grain[] {
  const parts = componentsOf(def)
  const sets = COMPONENTS[def.entity]
  const grains: Grain[] = []
  if (parts.every((c) => sets.table.has(c))) {
    grains.push('week')
    if (!parts.some((c) => c in QUANTILES)) grains.push('season')
  }
  if (!def.scoring && parts.every((c) => sets.play.has(c))) grains.push('play')
  return grains
}

/**
 * The catalogue as the renderer and NLQ read it: no formulas, the grains each metric has, and its
 * stability once the models have measured it.
 */
export function catalogueInfo(
  stability: ReadonlyMap<string, MetricStability> = new Map()
): MetricInfo[] {
  return CATALOGUE.map((def) => {
    const info: Partial<MetricDef> = { ...def }
    delete info.value
    delete info.sample
    return {
      ...(info as Omit<MetricDef, 'value' | 'sample'>),
      grains: grainsOf(def),
      sampleLabel: sampleLabel(def.sample),
      stability: stability.get(def.id) ?? null
    }
  })
}
