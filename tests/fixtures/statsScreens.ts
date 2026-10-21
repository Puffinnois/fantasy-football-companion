import { CATALOGUE } from '@shared/stats/catalogue'
import { sampleLabel } from '@shared/stats/samples'
import type {
  MetricDef,
  MetricInfo,
  MetricStability,
  MetricValue,
  PlayerBio,
  StatsResult,
  StatsRow,
  StatsStatus
} from '@shared/stats/types'

/** The catalogue as `stats.catalogue()` serves it (no formulas; grains and stability stubbed). */
export function catalogue(stability: Record<string, MetricStability> = {}): MetricInfo[] {
  return CATALOGUE.map((def) => {
    const info: Partial<MetricDef> = { ...def }
    delete info.value
    delete info.sample
    return {
      ...(info as Omit<MetricDef, 'value' | 'sample'>),
      grains: ['week', 'season'],
      sampleLabel: sampleLabel(def.sample),
      stability: stability[def.id] ?? null
    }
  })
}

export function catalogueMap(
  stability: Record<string, MetricStability> = {}
): Map<string, MetricInfo> {
  return new Map(catalogue(stability).map((m) => [m.id, m]))
}

export const STATUS: StatsStatus = {
  available: true,
  through: { season: 2026, seasonType: 'REG', week: 6 },
  updatedAt: '2026-10-19T08:00:00.000Z',
  busy: false
}

export function value(v: number | null, over: Partial<MetricValue> = {}): MetricValue {
  return {
    value: v,
    raw: v,
    sample: v === null ? null : 100,
    qualified: v !== null,
    percentile: null,
    rank: null,
    estimated: false,
    ...over
  }
}

export function row(
  id: string,
  name: string,
  values: Record<string, MetricValue>,
  over: Partial<StatsRow> = {}
): StatsRow {
  return { id, name, team: 'SEA', position: 'WR', group: {}, games: 6, values, ...over }
}

/** A result over `metrics` (the catalogue's units), rows in the engine's order. */
export function result(
  metrics: string[],
  rows: StatsRow[],
  over: Partial<StatsResult> = {}
): StatsResult {
  const byId = new Map(CATALOGUE.map((m) => [m.id, m]))
  return {
    grain: 'season',
    columns: metrics.map((id) => {
      const m = byId.get(id)!
      return {
        id,
        label: m.label,
        short: m.short,
        unit: m.unit,
        decimals: m.decimals,
        direction: m.direction,
        seasons: [2026]
      }
    }),
    rows,
    total: rows.length,
    notes: [],
    ms: 12,
    ...over
  }
}

/** A player as `stats.player()` reads him: "Player 0" for p0, a WR on SEA. */
export function bio(id: string, over: Partial<PlayerBio> = {}): PlayerBio {
  return {
    id,
    name: `Player ${id.slice(1)}`,
    firstName: 'Player',
    lastName: id.slice(1),
    position: 'WR',
    team: 'SEA',
    jersey: 11,
    birthDate: '2000-01-15',
    height: 73,
    weight: 200,
    college: 'Ohio State',
    draft: { year: 2021, round: 1, pick: 10, team: 'SEA' },
    rookieSeason: 2021,
    seasons: [2025, 2026],
    sleeperId: null,
    status: null,
    ...over
  }
}
