import { CATALOGUE, componentsOf } from '@shared/stats/catalogue'
import type { Entity, MetricDef, MetricStability } from '@shared/stats/types'
import type { StatsDb } from '../db'
import { compileQuery, MAX_METRICS } from '../engine/compile'
import { grainsOf } from '../engine/registry'
import { writeTable } from '../identity'
import { STATS_FIRST_SEASON } from '../sources'
import { pearson } from './linear'

/**
 * Metric stability (stats-analysis spec §8.6), from 2019 to the prior season, regular seasons:
 * - year to year: Pearson r between a player's qualified seasons, within each position and pooled
 *   (weighted by pairs), since between-position gaps would inflate it;
 * - split-half: r between the odd and the even weeks of a qualified season (each half qualified
 *   at half the sample), corrected to a full season by Spearman–Brown;
 * - prior: the sample at which a rate is half signal, k = n × (1 − r) / r at the halves' median
 *   sample n: what the `shrunk` transform gives the league mean (spec §8.5).
 */

/** Pairs a correlation needs to be reported. */
export const MIN_PAIRS = 30
/** Reliability from the year-to-year r. */
export const RELIABILITY = { high: 0.6, medium: 0.35 } as const

export const reliabilityOf = (r: number | null): MetricStability['reliability'] =>
  r === null ? null : r >= RELIABILITY.high ? 'high' : r >= RELIABILITY.medium ? 'medium' : 'low'

/** What stability can be measured on: summed metrics with a season grain (a combine profile is constant). */
function measurable(m: MetricDef): boolean {
  const tokens = componentsOf(m)
  const states = tokens.filter((t) => t.startsWith('last:'))
  if (m.entity === 'player' && states.length > 0) return false
  return grainsOf(m).includes('season') || grainsOf(m).includes('week')
}

/** Pearson r within each group of pairs (≥ 10 pairs), pooled by pairs; null under `MIN_PAIRS`. */
function pooled(pairs: { group: string; x: number; y: number }[]): { r: number | null; n: number } {
  const by = new Map<string, { x: number[]; y: number[] }>()
  for (const p of pairs) {
    const g = by.get(p.group) ?? { x: [], y: [] }
    g.x.push(p.x)
    g.y.push(p.y)
    by.set(p.group, g)
  }
  let sum = 0
  let n = 0
  for (const g of by.values()) {
    if (g.x.length < 10) continue
    const r = pearson(g.x, g.y)
    if (!Number.isFinite(r)) continue
    sum += r * g.x.length
    n += g.x.length
  }
  return n >= MIN_PAIRS ? { r: sum / n, n } : { r: null, n }
}

async function rowsOf(
  db: StatsDb,
  entity: Entity,
  metrics: MetricDef[],
  seasons: number[],
  halves: boolean
): Promise<StabilityRow[][]> {
  const positions = metrics[0].positions
  const compiled = compileQuery(
    {
      entity,
      metrics: metrics.map((m) => m.id),
      scope: {
        seasons,
        seasonType: 'REG',
        ...(entity === 'player' && positions !== 'all' ? { positions } : {})
      },
      groupBy: ['season'],
      // Fantasy metrics are measured under PPR.
      scoring: 'ppr'
    },
    {
      currentSeason: Math.max(...seasons),
      hasLeague: false,
      internal: { unlimited: true, halves }
    }
  )
  // A season is about 17 games; a half about 8.5 (the qualification factor, spec amendment E).
  const sql = compiled.sql.replaceAll('$factor', halves ? '0.5' : '1')
  const raw = await db.all<Record<string, unknown>>(sql, compiled.params)
  return metrics.map((_, i) =>
    raw
      .filter(
        (r) => r[`q${i}`] === true && typeof r[`v${i}`] === 'number' && Number.isFinite(r[`v${i}`])
      )
      .map((r) => ({
        id: String(r.id),
        season: Number(r.g_season),
        half: halves ? Number(r.g_half) : null,
        position: (r.position as string | null) ?? null,
        v: r[`v${i}`] as number,
        s: Number(r[`s${i}`] ?? 0)
      }))
  )
}

const median = (xs: number[]): number => {
  const sorted = [...xs].sort((a, b) => a - b)
  return sorted.length === 0 ? NaN : sorted[Math.floor(sorted.length / 2)]
}

/** A qualified row of a metric: one player (team) season, or one half of it. */
export interface StabilityRow {
  id: string
  season: number
  /** 1 for the odd weeks, 0 for the even ones; null for a whole season. */
  half: number | null
  position: string | null
  v: number
  /** The metric's sample. */
  s: number
}

/**
 * One metric's stability from its qualified rows: year to year from consecutive seasons, the
 * split-half r (corrected to a season) and, for a rate, the prior from the halves. `halves` is
 * null for a state (a rating at the end of the scope has no halves).
 */
export function stabilityFrom(
  full: StabilityRow[],
  halves: StabilityRow[] | null,
  kind: MetricDef['kind']
): MetricStability {
  const bySeason = new Map(full.map((r) => [`${r.id}|${r.season}`, r]))
  const yoy = pooled(
    full.flatMap((r) => {
      const next = bySeason.get(`${r.id}|${r.season + 1}`)
      return next ? [{ group: r.position ?? '', x: r.v, y: next.v }] : []
    })
  )
  let splitHalf: number | null = null
  let prior: number | null = null
  if (halves) {
    const byHalf = new Map(halves.map((r) => [`${r.id}|${r.season}|${r.half}`, r]))
    const pairs = halves
      .filter((r) => r.half === 1)
      .flatMap((r) => {
        const even = byHalf.get(`${r.id}|${r.season}|0`)
        return even ? [{ group: r.position ?? '', x: r.v, y: even.v, n: (r.s + even.s) / 2 }] : []
      })
    const half = pooled(pairs)
    if (half.r !== null) {
      splitHalf = half.r > 0 ? (2 * half.r) / (1 + half.r) : half.r
      const n = median(pairs.map((p) => p.n))
      if (kind === 'rate' && half.r > 0 && Number.isFinite(n) && n > 0) {
        prior = (n * (1 - half.r)) / half.r
      }
    }
  }
  return {
    yearToYear: yoy.r,
    pairs: yoy.n,
    splitHalf,
    prior,
    reliability: reliabilityOf(yoy.r)
  }
}

/** Measures every catalogue metric; `through` is the last season used (the prior season). */
export async function measureStability(
  db: StatsDb,
  through: number
): Promise<Map<string, MetricStability>> {
  const seasons: number[] = []
  for (let s = STATS_FIRST_SEASON; s <= through; s++) seasons.push(s)
  const out = new Map<string, MetricStability>()
  // Two seasons with games at least: there is nothing to pair before.
  const played = await db.get<{ n: number }>(
    `SELECT count(DISTINCT season)::INTEGER AS n FROM player_week
     WHERE season BETWEEN ${STATS_FIRST_SEASON} AND ${Math.trunc(through)}`
  )
  if (seasons.length < 2 || (played?.n ?? 0) < 2) return out
  // Batches share the positions they apply to, so each query reads only those players' rows.
  const batches: MetricDef[][] = []
  for (const entity of ['player', 'team'] as Entity[]) {
    const groups = new Map<string, MetricDef[]>()
    for (const m of CATALOGUE.filter((x) => x.entity === entity && measurable(x))) {
      const key = m.positions === 'all' ? 'all' : [...m.positions].sort().join(',')
      groups.set(key, [...(groups.get(key) ?? []), m])
    }
    for (const group of groups.values()) {
      for (let i = 0; i < group.length; i += MAX_METRICS) {
        batches.push(group.slice(i, i + MAX_METRICS))
      }
    }
  }
  for (const batch of batches) {
    const entity = batch[0].entity
    const full = await rowsOf(db, entity, batch, seasons, false)
    const halved = batch.filter((m) => !componentsOf(m).some((t) => t.startsWith('last:')))
    const halves = halved.length > 0 ? await rowsOf(db, entity, halved, seasons, true) : []
    batch.forEach((m, j) => {
      const h = halved.indexOf(m)
      out.set(m.id, stabilityFrom(full[j], h >= 0 ? halves[h] : null, m.kind))
    })
  }
  return out
}

export const STABILITY_COLUMNS: Record<string, string> = {
  metric_id: 'VARCHAR',
  year_to_year: 'DOUBLE',
  pairs: 'INTEGER',
  split_half: 'DOUBLE',
  prior: 'DOUBLE',
  reliability: 'VARCHAR',
  through: 'INTEGER'
}

/** Writes `metric_stability`, one row per measured metric. */
export async function writeStability(
  db: StatsDb,
  stability: Map<string, MetricStability>,
  through: number
): Promise<void> {
  await writeTable(
    db,
    'metric_stability',
    STABILITY_COLUMNS,
    [...stability].map(([id, s]) => [
      id,
      s.yearToYear,
      s.pairs,
      s.splitHalf,
      s.prior,
      s.reliability,
      through
    ])
  )
}

/** Reads `metric_stability` (empty before the models first run). */
export async function readStability(db: StatsDb): Promise<Map<string, MetricStability>> {
  const exists = await db.get(
    "SELECT 1 FROM duckdb_tables() WHERE schema_name = 'main' AND table_name = 'metric_stability'"
  )
  if (!exists) return new Map()
  const rows = await db.all<{
    metric_id: string
    year_to_year: number | null
    pairs: number
    split_half: number | null
    prior: number | null
    reliability: MetricStability['reliability']
  }>('SELECT * FROM metric_stability')
  return new Map(
    rows.map((r) => [
      r.metric_id,
      {
        yearToYear: r.year_to_year,
        pairs: r.pairs,
        splitHalf: r.split_half,
        prior: r.prior,
        reliability: r.reliability
      }
    ])
  )
}
