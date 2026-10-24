import { cellTitle, fmtStat } from '@/lib/stats/format'
import { qualifies } from '@/lib/stats/leaderboard'
import { appliesToPosition, inFantasy, positionTab, TILES } from '@/lib/stats/player'
import { queryScope, type StatsScope } from '@/lib/stats/scope'
import { missingFor, standing, STANDING_METRICS, teamRank, type WeekSeries } from '@/lib/stats/team'
import { STATS_TEAMS, TEAM_NAMES } from '@shared/stats/nflTeams'
import type {
  MetricInfo,
  PositionGroup,
  StatsOwnership,
  StatsQuery,
  StatsResult,
  StatsRow,
  StatsStatus
} from '@shared/stats/types'

/** Compare (spec §9.5): three slots, players at one position or teams. */
export type CompareEntity = 'player' | 'team'

/** The three slots, in series order (--s1, --s2, --s3); null is an open slot. */
export type Slots = [string | null, string | null, string | null]

export const NO_SLOTS: Slots = [null, null, null]

/** What Compare shows, kept by StatsApp across tabs; `slots` null until the defaults are chosen. */
export interface CompareState {
  entity: CompareEntity
  position: PositionGroup
  perGame: boolean
  slots: Slots | null
  /** The player or team Compare was opened from (a dashboard's Compare button). */
  seed: string | null
  side: 'offense' | 'defense'
}

export const DEFAULT_COMPARE: CompareState = {
  entity: 'player',
  position: 'WR',
  perGame: true,
  slots: null,
  seed: null,
  side: 'offense'
}

/**
 * Compare › Teams rows (handoff README §7): offense, defense, special teams and situational,
 * percentiles among the 32. An "allowed" metric is better lower: its percentile says so.
 */
export const TEAM_GROUPS: [string, string[]][] = [
  [
    'Offense',
    [
      'off_epa_play',
      'off_success_rate',
      'off_explosive_rate',
      'off_pass_epa',
      'off_rush_epa',
      'off_sack_rate'
    ]
  ],
  [
    'Defense',
    ['def_epa_play', 'def_success_rate', 'def_explosive_rate', 'def_pressure_rate', 'def_sack_rate']
  ],
  ['Special teams', ['team_fgoe', 'team_punt_net_avg']],
  ['Situational', ['off_third_down_pct', 'off_rz_td_pct', 'def_third_down_pct', 'def_rz_td_pct']]
]

/** A team card's record, division place and Elo. */
const TEAM_CARD = [...STANDING_METRICS, 'elo']

export interface CompareGroupDef {
  label: string
  metrics: string[]
}

/** The rows Compare shows: a player position's leaderboard groups, or the team groups. */
export function compareGroups(
  entity: CompareEntity,
  position: PositionGroup,
  byId: ReadonlyMap<string, MetricInfo>
): CompareGroupDef[] {
  const groups = entity === 'team' ? TEAM_GROUPS : positionTab(position).groups
  return groups
    .map(([label, ids]) => ({
      label,
      metrics: ids.filter((id) => {
        const info = byId.get(id)
        return entity === 'team'
          ? info?.entity === 'team'
          : info?.entity === 'player' && appliesToPosition(info, position)
      })
    }))
    .filter((g) => g.metrics.length > 0)
}

/** Every player at the position (a rank is among the position), or every team. */
const ROWS: Record<CompareEntity, number> = { player: 5000, team: 40 }

/**
 * One query over the position, or the 32 teams: the rows, the qualifier and the sort (players), the
 * record and Elo (teams). Counts per game when asked (players); team rows are rates.
 */
export function compareQuery(
  entity: CompareEntity,
  position: PositionGroup,
  groups: readonly CompareGroupDef[],
  scope: StatsScope,
  status: StatsStatus | null,
  perGame: boolean
): StatsQuery {
  const tab = positionTab(position)
  const extra = entity === 'player' ? [tab.qualifier, tab.sort] : TEAM_CARD
  const metrics = [
    ...new Set([...groups.flatMap((g) => g.metrics), ...extra.filter((m) => m !== undefined)])
  ]
  return {
    entity,
    metrics,
    scope: {
      ...queryScope(scope, status),
      ...(entity === 'player' ? { positions: [position] } : {})
    },
    transform: entity === 'player' && perGame ? 'perGame' : 'raw',
    sort: { metric: metrics[0], dir: 'desc' },
    scoring: scope.scoring,
    limit: ROWS[entity]
  }
}

/** Who a slot ranks among: the position's qualified players, or every team. */
export function comparePool(
  entity: CompareEntity,
  position: PositionGroup,
  result: StatsResult | undefined
): Set<string> {
  const rows = result?.rows ?? []
  if (entity === 'team') return new Set(rows.map((r) => r.id))
  const tab = positionTab(position)
  return new Set(rows.filter((r) => r.position === position && qualifies(r, tab)).map((r) => r.id))
}

export interface CompareCell {
  text: string
  /** 0–100 among the pool; null below the metric's sample or outside the pool. */
  percentile: number | null
  /** "#4". */
  rank: string | null
  /** The best value of the row (no lead on a tie between every slot, or a neutral metric). */
  lead: boolean
  title: string
}

export interface CompareRow {
  metric: string
  label: string
  /** "per game" or "total" for a count (players). */
  sub: string
  info: MetricInfo | null
  /** One per slot; null for an open slot. */
  cells: (CompareCell | null)[]
  /** Why the row is empty for the season ("Not published for 2026 yet."). */
  missing: string | null
}

export interface CompareView {
  groups: { label: string; rows: CompareRow[] }[]
  /** Rows each slot leads. */
  leads: number[]
  /** Rows that can be led: a better side and data. */
  counted: number
}

/** Every row, each slot ranked among the pool; the best value in a row leads it. */
export function compareView(
  result: StatsResult | undefined,
  slots: Slots,
  groups: readonly CompareGroupDef[],
  byId: ReadonlyMap<string, MetricInfo>,
  pool: ReadonlySet<string>,
  perGame: boolean,
  season: number
): CompareView {
  const among = (r: StatsRow): boolean => pool.has(r.id)
  const leads = slots.map(() => 0)
  let counted = 0
  const view = groups.map((g) => ({
    label: g.label,
    rows: g.metrics.map((metric): CompareRow => {
      const info = byId.get(metric) ?? null
      const column = result?.columns.find((c) => c.id === metric)
      const missing = missingFor(column, info ?? undefined, season)
      const f = { unit: info?.unit ?? 'number', decimals: info?.decimals ?? 1, kind: info?.kind }
      const direction = info?.direction ?? 'neutral'
      const counts = info?.kind === 'count' && perGame
      const values = slots.map((id) =>
        id ? (result?.rows.find((r) => r.id === id)?.values[metric] ?? null) : null
      )
      const nums = values.map((v) => v?.value ?? null)
      const filled = nums.filter((v): v is number => v !== null)
      const best =
        direction === 'neutral' || filled.length < 2
          ? null
          : direction === 'lower'
            ? Math.min(...filled)
            : Math.max(...filled)
      const tie = best !== null && filled.every((v) => v === best)
      if (best !== null && !missing) counted++
      return {
        metric,
        label: info?.label ?? metric,
        sub: info?.kind === 'count' ? (counts ? 'per game' : 'total') : '',
        info,
        missing,
        cells: slots.map((id, k) => {
          if (!id) return null
          const v = values[k]
          const lead = !missing && !tie && best !== null && nums[k] === best
          if (lead) leads[k]++
          const place = result ? teamRank(result, id, metric, direction, among) : null
          return {
            text: missing ? '—' : fmtStat(v?.value ?? null, f, counts),
            percentile: missing ? null : (place?.percentile ?? null),
            rank: place && !missing ? `#${place.rank}` : null,
            lead,
            title:
              v && info && place
                ? cellTitle({ ...v, percentile: place.percentile, rank: place.rank }, info, null)
                : v?.value != null
                  ? 'Below the qualifying sample'
                  : ''
          }
        })
      }
    })
  }))
  return { groups: view, leads, counted }
}

export interface PlayerCard {
  id: string
  first: string
  last: string
  team: string | null
  games: string
  qualified: boolean
}

export interface TeamCard {
  id: string
  name: string
  record: string
  /** "1st in the AFC East". */
  place: string | null
  elo: string | null
}

/** A slot's card: the player's name split as the handoff draws it, his team and games. */
export function playerCard(
  result: StatsResult | undefined,
  id: string,
  pool: ReadonlySet<string>
): PlayerCard {
  const r = result?.rows.find((x) => x.id === id)
  const name = r?.name ?? id
  const [first, ...rest] = name.split(' ')
  return {
    id,
    first: rest.length ? first : '',
    last: rest.length ? rest.join(' ') : first,
    team: r?.team ?? null,
    games: r ? `${r.games} G` : '0 G',
    qualified: pool.has(id)
  }
}

/** A team's card: its name, record, place in its division and Elo. */
export function teamCard(result: StatsResult | undefined, id: string): TeamCard {
  const r = result?.rows.find((x) => x.id === id)
  const v = (m: string): number | null => r?.values[m]?.value ?? null
  const ties = v('ties') ?? 0
  return {
    id,
    name: TEAM_NAMES[id] ?? id,
    record: r ? `${v('wins') ?? 0}–${v('losses') ?? 0}${ties ? `–${ties}` : ''}` : '0–0',
    place: standing(result, id),
    elo: v('elo') === null ? null : Math.round(v('elo')!).toLocaleString('en-US')
  }
}

/** The pool best first by the position's leaderboard sort (players), or by Elo (teams). */
function ranked(
  entity: CompareEntity,
  position: PositionGroup,
  result: StatsResult,
  pool: ReadonlySet<string>
): StatsRow[] {
  const metric = entity === 'team' ? 'elo' : positionTab(position).sort
  return result.rows
    .filter((r) => pool.has(r.id))
    .sort((a, b) => (b.values[metric]?.value ?? -Infinity) - (a.values[metric]?.value ?? -Infinity))
}

/**
 * The slots Compare opens with (handoff README §7). Seeded: that player and the position's top two
 * others, or that team and the two nearest it in Elo. Otherwise the top three, my best player at
 * the position in slot 3 when none of mine is there (players); the top three by Elo (teams).
 */
export function defaultSlots(
  entity: CompareEntity,
  position: PositionGroup,
  result: StatsResult,
  pool: ReadonlySet<string>,
  seed: string | null,
  mine: ReadonlySet<string> = new Set()
): Slots {
  const order = ranked(entity, position, result, pool)
  const ids = (rows: StatsRow[]): string[] => rows.map((r) => r.id)
  let out: string[]
  if (seed && entity === 'team') {
    const elo = (id: string): number | null =>
      result.rows.find((r) => r.id === id)?.values.elo?.value ?? null
    const e = elo(seed)
    const near =
      e === null
        ? ids(order).filter((id) => id !== seed)
        : ids(order)
            .filter((id) => id !== seed && elo(id) !== null)
            .sort((a, b) => Math.abs(elo(a)! - e) - Math.abs(elo(b)! - e))
    out = [seed, ...near.slice(0, 2)]
  } else if (seed) {
    out = [
      seed,
      ...ids(order)
        .filter((id) => id !== seed)
        .slice(0, 2)
    ]
  } else {
    out = ids(order).slice(0, 3)
    const best = order.find((r) => mine.has(r.id))
    if (entity === 'player' && best && !out.some((id) => mine.has(id)) && out.length === 3)
      out[2] = best.id
  }
  return [out[0] ?? null, out[1] ?? null, out[2] ?? null]
}

/** A slot's choices: my players first ("· your team"), then the pool best first; every team A–Z. */
export function slotOptions(
  entity: CompareEntity,
  position: PositionGroup,
  result: StatsResult | undefined,
  pool: ReadonlySet<string>,
  ownership: StatsOwnership | null
): { value: string; label: string }[] {
  if (entity === 'team') {
    return STATS_TEAMS.map((t) => ({ value: t, label: `${t} · ${TEAM_NAMES[t] ?? t}` }))
  }
  if (!result) return []
  const mine = (id: string): boolean => ownership?.players[id]?.mine === true
  const order = ranked(entity, position, result, pool)
  const rest = result.rows.filter((r) => !pool.has(r.id) && r.position === position)
  return [...order.filter((r) => mine(r.id)), ...order.filter((r) => !mine(r.id)), ...rest].map(
    (r) => ({
      value: r.id,
      label: `${r.name} · ${r.team ?? 'FA'}${mine(r.id) ? ' · your team' : ''}`
    })
  )
}

/**
 * The weekly chart's metric: fantasy points where the position scores them, else its first tile;
 * a team's EPA per play, offense or defense.
 */
export function chartMetric(
  entity: CompareEntity,
  position: PositionGroup,
  side: 'offense' | 'defense'
): string {
  if (entity === 'team') return side === 'offense' ? 'off_epa_play' : 'def_epa_play'
  return inFantasy(position) ? 'fantasy_points' : TILES[position][0]
}

/** The chart's rows: every player at the position (or team) by week, for the slots and the median. */
export function weeklyCompareQuery(
  entity: CompareEntity,
  position: PositionGroup,
  metric: string,
  scope: StatsScope,
  status: StatsStatus | null
): StatsQuery {
  const tab = positionTab(position)
  const metrics = entity === 'player' && tab.qualifier ? [metric, tab.qualifier] : [metric]
  return {
    entity,
    metrics: [...new Set(metrics)],
    scope: {
      ...queryScope(scope, status),
      ...(entity === 'player' ? { positions: [position] } : {})
    },
    groupBy: ['week'],
    transform: 'raw',
    sort: { metric, dir: 'desc' },
    scoring: scope.scoring,
    limit: 5000
  }
}

/**
 * One line per filled slot and the median of the pool each week (dashed in the chart). A week
 * without a slot's row is a gap (a bye or a game he missed).
 */
export function compareSeries(
  result: StatsResult | null,
  slots: Slots,
  labels: readonly string[],
  metric: string,
  weeks: readonly number[],
  pool: ReadonlySet<string>
): { series: (WeekSeries & { slot: number })[]; median: WeekSeries } {
  const rows = result?.rows ?? []
  const at = (id: string, week: number): number | null =>
    rows.find((r) => r.id === id && Number(r.group.week) === week)?.values[metric]?.value ?? null
  const series = slots.flatMap((id, slot) =>
    id
      ? [
          {
            id,
            slot,
            label: labels[slot] ?? id,
            points: weeks.map((week) => ({ week, value: at(id, week) }))
          }
        ]
      : []
  )
  const median = (week: number): number | null => {
    const vs = rows
      .filter((r) => Number(r.group.week) === week && pool.has(r.id) && r.games > 0)
      .map((r) => r.values[metric]?.value)
      .filter((v): v is number => v !== null && v !== undefined)
      .sort((a, b) => a - b)
    if (!vs.length) return null
    const m = Math.floor(vs.length / 2)
    return vs.length % 2 ? vs[m] : (vs[m - 1] + vs[m]) / 2
  }
  return {
    series,
    median: {
      id: 'median',
      label: 'Median',
      points: weeks.map((week) => ({ week, value: median(week) }))
    }
  }
}

/** "Percentiles vs 110 qualified WRs", "Percentiles vs all 32 teams". */
export function poolNote(
  entity: CompareEntity,
  position: PositionGroup,
  pool: ReadonlySet<string>
): string {
  return entity === 'team'
    ? `Percentiles vs all ${pool.size} teams. Allowed metrics rank lower as better.`
    : `Percentiles vs ${pool.size} qualified ${position}s.`
}
