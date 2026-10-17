import { CATALOGUE, componentsOf } from '@shared/stats/catalogue'
import type { Entity, Grain, MetricDef, MetricInfo } from '@shared/stats/types'
import { playerComponentNames } from '../derived/player'
import { PLAYER_PLAY_COMPONENTS, TEAM_PLAY_COMPONENTS } from '../derived/plays'
import { teamComponentNames } from '../derived/team'

/** Fantasy components, joined from `fantasy_week` / `team_fantasy_week` under the chosen scoring. */
export const PLAYER_FANTASY = ['fp', 'xfp']
export const TEAM_FANTASY = ['fpa_qb', 'fpa_rb', 'fpa_wr', 'fpa_te', 'fpa_k']

/** The components each grain can sum, by entity (spec §7.2: the grain decides the tables). */
export const COMPONENTS: Record<Entity, Record<'table' | 'play', ReadonlySet<string>>> = {
  player: {
    table: new Set([...playerComponentNames(), ...PLAYER_FANTASY]),
    play: new Set([...PLAYER_PLAY_COMPONENTS.map((c) => c.name), 'games'])
  },
  team: {
    table: new Set([...teamComponentNames(), ...TEAM_FANTASY]),
    play: new Set([
      ...TEAM_PLAY_COMPONENTS.flatMap((c) => [`off_${c.name}`, `def_${c.name}`]),
      'games'
    ])
  }
}

/**
 * Where a metric can be computed: week and season from the derived tables; play when every
 * component comes from plays (and it does not depend on the scoring).
 */
export function grainsOf(def: MetricDef): Grain[] {
  const parts = componentsOf(def)
  const sets = COMPONENTS[def.entity]
  const grains: Grain[] = []
  if (parts.every((c) => sets.table.has(c))) grains.push('week', 'season')
  if (!def.scoring && parts.every((c) => sets.play.has(c))) grains.push('play')
  return grains
}

/** The catalogue as the renderer and NLQ read it: no formulas, and the grains each metric has. */
export function catalogueInfo(): MetricInfo[] {
  return CATALOGUE.map((def) => {
    const info: Partial<MetricDef> = { ...def }
    delete info.value
    delete info.sample
    return { ...(info as Omit<MetricDef, 'value' | 'sample'>), grains: grainsOf(def) }
  })
}
