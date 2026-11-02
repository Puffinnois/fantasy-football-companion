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
