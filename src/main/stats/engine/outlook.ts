import type {
  MetricStability,
  OutlookQuery,
  OutlookSignal,
  OutlookTrend,
  PlayerOutlook,
  StatsRow
} from '@shared/stats/types'
import { METRICS } from '@shared/stats/catalogue'
import type { StatsDb } from '../db'
import { StatsQueryError, type CompileContext } from './compile'
import { runQuery } from './run'

/** Usage shares compared last four games against the games before (spec §8.5 trend). */
export const TREND_METRICS = [
  'snap_share',
  'route_participation',
  'target_share',
  'carry_share',
  'opportunity_share'
]
/** Efficiency over expected that tends to regress (spec §8.5 regression flags). */
export const REGRESSION_METRICS = ['fpoe', 'td_over_expected', 'yacoe']
/** A role change: the last four games' share this many standard errors from the games before. */
export const ROLE_CHANGE_Z = 2
/** Running hot / cold: an expected move back of at least this many position standard deviations. */
export const SIGNAL_Z = 1
/**
 * Players with fewer games do not set the position's mean and spread: 6, or half the most games
 * anyone has played so far (early in a season).
 */
export const POPULATION_GAMES = 6

const GSIS = /^00-[0-9]{7}$/
const FANTASY_POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K']

const value = (row: StatsRow | undefined, id: string): number | null =>
  row?.values[id]?.value ?? null

/**
 * The share's change, last four games against the games before (exact, from the counts: a share's
 * sample is the player's count, so its denominator is sample ÷ share; the opportunity share counts
 * carries and targets). Noise is the player's own week-to-week spread of the share (snaps and
 * routes come in series, so a binomial test would flag every small move): z = change / (s ×
 * √(1/4 + 1/k)) over the k earlier games, with s the pooled weekly standard deviation.
 */
export function trendOf(
  id: string,
  all: StatsRow | undefined,
  last: StatsRow | undefined,
  weeks: StatsRow[]
): OutlookTrend {
  const season = value(all, id)
  const last4 = value(last, id)
  const count = (row: StatsRow | undefined): number | null => {
    if (!row) return null
    if (id === 'opportunity_share') {
      const c = value(row, 'carries')
      const t = value(row, 'targets')
      return c === null || t === null ? null : c + t
    }
    return row.values[id]?.sample ?? null
  }
  const x = count(all)
  const x4 = count(last)
  const n = x !== null && season ? x / season : null
  const n4 = x4 !== null && last4 ? x4 / last4 : null
  let change: number | null = null
  if (season !== null && last4 !== null && x !== null && x4 !== null && n !== null && n4 !== null) {
    const restN = n - n4
    if (restN > 0) change = last4 - (x - x4) / restN
    else if (x === x4) change = null
  }
  // Weekly shares, oldest first: the last four, and the games before them.
  const weekly = weeks.map((w) => value(w, id)).filter((v): v is number => v !== null)
  const recent = weekly.slice(-4)
  const before = weekly.slice(0, -4)
  let z: number | null = null
  if (change !== null && recent.length === 4 && before.length >= 3) {
    const sq = (xs: number[]): number => {
      const m = xs.reduce((a, b) => a + b, 0) / xs.length
      return xs.reduce((a, b) => a + (b - m) ** 2, 0)
    }
    const sd = Math.sqrt((sq(recent) + sq(before)) / (weekly.length - 2))
    z = sd > 0 ? change / (sd * Math.sqrt(1 / 4 + 1 / before.length)) : null
  }
  return {
    metric: id,
    season,
    last4,
    change,
    z,
    roleChange: z === null ? null : z >= ROLE_CHANGE_Z ? 'up' : z <= -ROLE_CHANGE_Z ? 'down' : null
  }
}

/**
 * Running hot or cold (spec §8.5): the value regresses toward the position mean by (1 − r), r its
 * year-to-year stability, so the expected move back is (1 − r)(v − mean). Flagged at `SIGNAL_Z`
 * position standard deviations.
 */
export function signalOf(
  id: string,
  rows: StatsRow[],
  player: StatsRow | undefined,
  stability: ReadonlyMap<string, MetricStability>
): OutlookSignal {
  const v = value(player, id)
  const most = Math.max(0, ...rows.map((r) => r.games))
  const games = Math.min(POPULATION_GAMES, Math.ceil(most / 2))
  const pop = rows
    .filter((r) => r.games >= games && r.values[id]?.qualified)
    .map((r) => r.values[id].value)
    .filter((x): x is number => x !== null)
  const r = stability.get(id)?.yearToYear ?? null
  if (v === null || pop.length < 10 || r === null) {
    return { metric: id, value: v, mean: null, expectedChange: null, z: null, signal: null }
  }
  const mean = pop.reduce((a, b) => a + b, 0) / pop.length
  const sd = Math.sqrt(pop.reduce((a, b) => a + (b - mean) ** 2, 0) / (pop.length - 1))
  const expectedChange = -(1 - Math.max(0, r)) * (v - mean)
  const z = sd > 0 ? -expectedChange / sd : null
  return {
    metric: id,
    value: v,
    mean,
    expectedChange,
    z,
    signal: z === null ? null : z >= SIGNAL_Z ? 'hot' : z <= -SIGNAL_Z ? 'cold' : null
  }
}

/** Spec §8.5: ceiling, floor, boom and bust, trend and role change, regression flags, schedule. */
export async function playerOutlook(
  db: StatsDb,
  q: OutlookQuery,
  ctx: CompileContext,
  stability: ReadonlyMap<string, MetricStability>
): Promise<PlayerOutlook> {
  if (typeof q.player !== 'string' || !GSIS.test(q.player))
    throw new StatsQueryError('player must be a gsis id')
  const scoring = q.scoring ?? 'ppr'
  const scope = { seasons: [q.season], players: [q.player] }
  const counts = ['carries', 'targets']
  const season = (
    await runQuery(
      db,
      {
        entity: 'player',
        metrics: ['fp_ceiling', 'fp_floor', 'boom_rate', 'bust_rate', ...TREND_METRICS, ...counts],
        scope,
        scoring
      },
      ctx
    )
  ).rows[0]
  if (!season) throw new StatsQueryError(`no games for ${q.player} in ${q.season}`)
  const [last16, last4, weeks] = await Promise.all([
    runQuery(
      db,
      {
        entity: 'player',
        metrics: ['fp_ceiling', 'fp_floor'],
        scope: {
          ...scope,
          seasons: [q.season - 1, q.season].filter((s) => s >= 2019),
          lastNGames: 16
        },
        scoring
      },
      ctx
    ),
    runQuery(
      db,
      {
        entity: 'player',
        metrics: [...TREND_METRICS, ...counts],
        scope: { ...scope, lastNGames: 4 }
      },
      ctx
    ),
    runQuery(
      db,
      { entity: 'player', metrics: [...TREND_METRICS, ...counts], scope, groupBy: ['week'] },
      ctx
    )
  ])
  const byWeek = [...weeks.rows].sort((a, b) => Number(a.group.week) - Number(b.group.week))
  const position = season.position
  const population = position
    ? await runQuery(
        db,
        {
          entity: 'player',
          metrics: REGRESSION_METRICS,
          scope: { seasons: [q.season], positions: [position as never] },
          transform: 'perGame',
          scoring,
          limit: 1000
        },
        ctx
      )
    : null
  const me = population?.rows.find((r) => r.id === q.player)

  // The rest of the regular season, against what each opponent allowed to the position.
  const team = season.team
  let opponents: string[] = []
  let easierBy: number | null = null
  if (team) {
    opponents = (
      await db.all<{ opp: string }>(
        `SELECT CASE WHEN home_team = ? THEN away_team ELSE home_team END AS opp FROM games
         WHERE season = ? AND game_type = 'REG' AND home_score IS NULL AND ? IN (home_team, away_team)
         ORDER BY week`,
        [team, q.season, team]
      )
    ).map((r) => r.opp)
    if (position && FANTASY_POSITIONS.includes(position) && opponents.length > 0) {
      const id = `fpa_${position.toLowerCase()}`
      const allowed = await runQuery(
        db,
        { entity: 'team', metrics: [id], scope: { seasons: [q.season] }, scoring, limit: 40 },
        ctx
      )
      const by = new Map(allowed.rows.map((r) => [r.id, r.values[id]?.value ?? null]))
      const all = [...by.values()].filter((x): x is number => x !== null)
      const left = opponents.map((o) => by.get(o)).filter((x): x is number => x != null)
      if (all.length > 0 && left.length > 0) {
        const league = all.reduce((a, b) => a + b, 0) / all.length
        easierBy = left.reduce((a, b) => a + b, 0) / left.length - league
      }
    }
  }
  return {
    player: q.player,
    season: q.season,
    scoring,
    position,
    team,
    games: season.games,
    ceiling: { season: value(season, 'fp_ceiling'), last16: value(last16.rows[0], 'fp_ceiling') },
    floor: { season: value(season, 'fp_floor'), last16: value(last16.rows[0], 'fp_floor') },
    boomRate: value(season, 'boom_rate'),
    bustRate: value(season, 'bust_rate'),
    // Only the shares that apply to the position (no route participation for a QB).
    trend: TREND_METRICS.filter((id) => {
      const positions = METRICS.get(id)?.positions
      return (
        positions === 'all' || (position !== null && (positions ?? []).includes(position as never))
      )
    }).map((id) => trendOf(id, season, last4.rows[0], byWeek)),
    regression: REGRESSION_METRICS.map((id) => signalOf(id, population?.rows ?? [], me, stability)),
    schedule: { opponents, easierBy }
  }
}
