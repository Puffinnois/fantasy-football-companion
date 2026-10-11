import type { Db } from '@main/db/connection'
import {
  listWhGames,
  type WhGame,
  type WhPlayer,
  type WhPlayerWeek,
  type WhTeamWeek
} from '@main/db/repos/warehouse'
import type { WarehouseClient } from '@main/sources/warehouse/client'
import { parseCombine } from '@main/sources/warehouse/combine'
import { parseFfOpportunity } from '@main/sources/warehouse/ffOpportunity'
import {
  firstKickoffs,
  isSnapshotDepthChart,
  parseDepthCharts
} from '@main/sources/warehouse/depthCharts'
import {
  parseGamesCsv,
  parsePlayerCsv,
  parseTeamCsv,
  regularWeeks,
  type PlayerCsvSpec
} from '@main/sources/warehouse/parse'
import { parseRosters } from '@main/sources/warehouse/rosters'
import { parseSleeperStats } from '@main/sources/warehouse/sleeperStats'
import type { AggregatePbp } from '@main/warehouse/job'
import { SkipStep } from './step'

/** Stats-warehouse spec: seasons 2019 through the Sleeper state season. */
export const WAREHOUSE_FIRST_SEASON = 2019
/** ffverse's expected-fantasy-points release (`ep_weekly_{season}.csv`). */
export const FF_OPPORTUNITY_URL =
  'https://github.com/ffverse/ffopportunity/releases/download/latest-data'
const SLEEPER_POST_WEEKS = 4
/** ESPN team codes that differ from nflverse's (QBR files). */
const ESPN_TEAM_CODES: Record<string, string> = { LAR: 'LA', WSH: 'WAS' }

/** What one step fetched; the sync writes each source's rows in one transaction. */
export interface StepRows {
  playerWeeks: WhPlayerWeek[]
  teamWeeks: WhTeamWeek[]
  games: WhGame[]
  players: WhPlayer[]
  /** `replace`: the step's profiles replace the source's; `latest`: keep each player's newest. */
  playersMode: 'replace' | 'latest'
  skipped: number
}

export function stepRows(partial: Partial<StepRows>): StepRows {
  return {
    playerWeeks: [],
    teamWeeks: [],
    games: [],
    players: [],
    playersMode: 'replace',
    skipped: 0,
    ...partial
  }
}

export interface StepContext {
  db: Db
  client: WarehouseClient
  /** The Sleeper state season. */
  current: number
  /** Sleeper state week and season type (`pre` / `regular` / `post` / `off`), for the current season. */
  stateWeek: number
  stateSeasonType: string
  /** Aggregates a downloaded play-by-play file; the warehouse worker in the app. */
  aggregatePbp: AggregatePbp
}

export interface WarehouseStep {
  /** `wh:<id>` (all-seasons) or `wh:<id>:<season>` in sync_log. */
  id: string
  /** The sources this step writes, each with the adapter version that writes it. */
  sources: { source: string; version: number }[]
  /** First season fetched (never before WAREHOUSE_FIRST_SEASON); unused for all-seasons steps. */
  firstSeason: number
  /** One file holding every season; fetched with season 0. */
  allSeasons: boolean
  /** The rows for `season`, or null when the file is not published. May throw `SkipStep`. */
  fetch(ctx: StepContext, season: number): Promise<StepRows | null>
}

const v1 = (...sources: string[]): { source: string; version: number }[] =>
  sources.map((source) => ({ source, version: 1 }))

/** A per-season player-week CSV fetched by `get`. */
function playerStep(
  spec: PlayerCsvSpec,
  get: (client: WarehouseClient, season: number) => Promise<string | null>
): WarehouseStep {
  return {
    id: spec.source,
    sources: v1(spec.source),
    firstSeason: WAREHOUSE_FIRST_SEASON,
    allSeasons: false,
    async fetch(ctx, season) {
      const csv = await get(ctx.client, season)
      if (csv === null) return null
      const parsed = parsePlayerCsv(csv, spec, WAREHOUSE_FIRST_SEASON)
      return stepRows({ playerWeeks: parsed.rows, skipped: parsed.skipped })
    }
  }
}

/** One all-seasons Next Gen Stats file. */
function ngsStep(source: string, file: string): WarehouseStep {
  const spec: PlayerCsvSpec = {
    source,
    ids: [{ column: 'player_gsis_id', keyType: 'gsis' }],
    season: 'season',
    week: 'week',
    seasonType: 'season_type',
    team: 'team_abbr'
  }
  return {
    id: source,
    sources: v1(source),
    firstSeason: WAREHOUSE_FIRST_SEASON,
    allSeasons: true,
    async fetch(ctx) {
      const csv = await ctx.client.nflverseCsv('nextgen_stats', file)
      if (csv === null) return null
      const parsed = parsePlayerCsv(csv, spec, WAREHOUSE_FIRST_SEASON)
      return stepRows({ playerWeeks: parsed.rows, skipped: parsed.skipped })
    }
  }
}

function pfrStep(kind: 'pass' | 'rush' | 'rec' | 'def'): WarehouseStep {
  return playerStep(
    {
      source: `pfr_${kind}`,
      ids: [{ column: 'pfr_player_id', keyType: 'pfr' }],
      season: 'season',
      week: 'week',
      seasonType: 'game_type',
      team: 'team',
      opponent: 'opponent'
    },
    (client, season) => client.nflverseCsv('pfr_advstats', `advstats_week_${kind}_${season}`)
  )
}

export interface SleeperWeek {
  seasonType: 'regular' | 'post'
  week: number
}

/** Spec §5: every week of a past season; the current season through the state week (all of it in the postseason). */
export function sleeperWeeks(
  season: number,
  ctx: Pick<StepContext, 'current' | 'stateWeek' | 'stateSeasonType'>
): SleeperWeek[] {
  const regular = (n: number): SleeperWeek[] =>
    Array.from({ length: n }, (_, i) => ({ seasonType: 'regular', week: i + 1 }))
  const post: SleeperWeek[] = Array.from({ length: SLEEPER_POST_WEEKS }, (_, i) => ({
    seasonType: 'post',
    week: i + 1
  }))
  if (season < ctx.current || ctx.stateSeasonType === 'post') {
    return [...regular(regularWeeks(season)), ...post]
  }
  if (ctx.stateSeasonType === 'regular') {
    return regular(Math.min(ctx.stateWeek, regularWeeks(season)))
  }
  return []
}

const sleeperStep: WarehouseStep = {
  id: 'sleeper',
  sources: v1('sleeper', 'sleeper_def', 'sleeper_team'),
  firstSeason: WAREHOUSE_FIRST_SEASON,
  allSeasons: false,
  async fetch(ctx, season) {
    const weeks = sleeperWeeks(season, ctx)
    if (weeks.length === 0) throw new SkipStep(`${season} has not started`)
    const out = stepRows({})
    for (const { seasonType, week } of weeks) {
      const rows = await ctx.client.sleeperStats(season, week, seasonType)
      const parsed = parseSleeperStats(rows, season, week, seasonType === 'post' ? 'POST' : 'REG')
      out.playerWeeks.push(...parsed.players)
      out.teamWeeks.push(...parsed.defs, ...parsed.teams)
      out.skipped += parsed.skipped
    }
    return out
  }
}

const schedulesStep: WarehouseStep = {
  id: 'schedules',
  sources: v1('schedules'),
  firstSeason: WAREHOUSE_FIRST_SEASON,
  allSeasons: true,
  async fetch(ctx) {
    const csv = await ctx.client.nflverseCsv('schedules', 'games')
    if (csv === null) return null
    const parsed = parseGamesCsv(csv, WAREHOUSE_FIRST_SEASON)
    return stepRows({ games: parsed.rows, skipped: parsed.skipped })
  }
}

const nflverseTeamStep: WarehouseStep = {
  id: 'nflverse_team',
  sources: v1('nflverse_team'),
  firstSeason: WAREHOUSE_FIRST_SEASON,
  allSeasons: false,
  async fetch(ctx, season) {
    const csv = await ctx.client.nflverseCsv('stats_team', `stats_team_week_${season}`)
    if (csv === null) return null
    const parsed = parseTeamCsv(
      csv,
      {
        source: 'nflverse_team',
        team: 'team',
        season: 'season',
        week: 'week',
        seasonType: 'season_type',
        opponent: 'opponent_team'
      },
      WAREHOUSE_FIRST_SEASON
    )
    return stepRows({ teamWeeks: parsed.rows, skipped: parsed.skipped })
  }
}

const ffOpportunityStep: WarehouseStep = {
  id: 'ff_opportunity',
  sources: v1('ff_opportunity'),
  firstSeason: WAREHOUSE_FIRST_SEASON,
  allSeasons: false,
  async fetch(ctx, season) {
    const csv = await ctx.client.text(`${FF_OPPORTUNITY_URL}/ep_weekly_${season}.csv`)
    if (csv === null) return null
    return stepRows(parseFfOpportunity(csv, WAREHOUSE_FIRST_SEASON))
  }
}

const qbrStep: WarehouseStep = {
  id: 'qbr',
  sources: v1('qbr'),
  firstSeason: WAREHOUSE_FIRST_SEASON,
  allSeasons: true,
  async fetch(ctx) {
    const weekly = await ctx.client.nflverseCsv('espn_data', 'qbr_week_level')
    const seasonal = await ctx.client.nflverseCsv('espn_data', 'qbr_season_level')
    if (weekly === null || seasonal === null) return null
    const base = {
      source: 'qbr',
      ids: [{ column: 'player_id', keyType: 'espn' as const }],
      season: 'season',
      seasonType: 'season_type',
      team: 'team_abb',
      teamCodes: ESPN_TEAM_CODES
    }
    const weeks = parsePlayerCsv(
      weekly,
      { ...base, week: 'game_week', opponent: 'opp_abb' },
      WAREHOUSE_FIRST_SEASON
    )
    const seasons = parsePlayerCsv(seasonal, { ...base, week: null }, WAREHOUSE_FIRST_SEASON)
    return stepRows({
      playerWeeks: [...weeks.rows, ...seasons.rows],
      skipped: weeks.skipped + seasons.skipped
    })
  }
}

const depthChartsStep: WarehouseStep = {
  id: 'depth_charts',
  sources: v1('depth_charts'),
  firstSeason: WAREHOUSE_FIRST_SEASON,
  allSeasons: false,
  async fetch(ctx, season) {
    const csv = await ctx.client.nflverseCsv('depth_charts', `depth_charts_${season}`)
    if (csv === null) return null
    const kickoffs = firstKickoffs(listWhGames(ctx.db, season))
    if (isSnapshotDepthChart(csv) && kickoffs.length === 0) {
      throw new SkipStep(`${season} schedule not loaded yet`)
    }
    const currentWeek = season === ctx.current ? ctx.stateWeek : null
    const parsed = parseDepthCharts(csv, season, kickoffs, currentWeek)
    return stepRows({ playerWeeks: parsed.rows, skipped: parsed.skipped })
  }
}

const rostersStep: WarehouseStep = {
  id: 'rosters',
  sources: v1('rosters'),
  firstSeason: WAREHOUSE_FIRST_SEASON,
  allSeasons: false,
  async fetch(ctx, season) {
    const csv = await ctx.client.nflverseCsv('weekly_rosters', `roster_weekly_${season}`)
    if (csv === null) return null
    const { weeks, bios } = parseRosters(csv, WAREHOUSE_FIRST_SEASON)
    return stepRows({
      playerWeeks: weeks.rows,
      players: bios,
      playersMode: 'latest',
      skipped: weeks.skipped
    })
  }
}

const combineStep: WarehouseStep = {
  id: 'combine',
  sources: v1('combine'),
  firstSeason: WAREHOUSE_FIRST_SEASON,
  allSeasons: true,
  async fetch(ctx) {
    const csv = await ctx.client.nflverseCsv('combine', 'combine')
    if (csv === null) return null
    const parsed = parseCombine(csv)
    return stepRows({ players: parsed.rows, skipped: parsed.skipped })
  }
}

/** Spec §6.1–§6.3: one season of play-by-play, aggregated off the main thread. */
const pbpStep: WarehouseStep = {
  id: 'pbp',
  sources: v1('pbp'),
  firstSeason: WAREHOUSE_FIRST_SEASON,
  allSeasons: false,
  async fetch(ctx, season) {
    const bytes = await ctx.client.nflverseFile('pbp', `play_by_play_${season}`)
    if (bytes === null) return null
    return stepRows(await ctx.aggregatePbp(bytes))
  }
}

/** Spec §5 and §6, in sync order (the schedule before depth charts, which map snapshots to its kickoffs). */
export const WAREHOUSE_STEPS: WarehouseStep[] = [
  sleeperStep,
  schedulesStep,
  playerStep(
    {
      source: 'nflverse_player',
      ids: [{ column: 'player_id', keyType: 'gsis' }],
      season: 'season',
      week: 'week',
      seasonType: 'season_type',
      team: 'team',
      opponent: 'opponent_team'
    },
    (client, season) => client.nflverseCsv('stats_player', `stats_player_week_${season}`)
  ),
  nflverseTeamStep,
  playerStep(
    {
      source: 'snaps',
      ids: [{ column: 'pfr_player_id', keyType: 'pfr' }],
      season: 'season',
      week: 'week',
      seasonType: 'game_type',
      team: 'team',
      opponent: 'opponent'
    },
    (client, season) => client.nflverseCsv('snap_counts', `snap_counts_${season}`)
  ),
  ffOpportunityStep,
  ngsStep('ngs_pass', 'ngs_passing'),
  ngsStep('ngs_rush', 'ngs_rushing'),
  ngsStep('ngs_rec', 'ngs_receiving'),
  pfrStep('pass'),
  pfrStep('rush'),
  pfrStep('rec'),
  pfrStep('def'),
  qbrStep,
  playerStep(
    {
      source: 'injuries',
      ids: [{ column: 'gsis_id', keyType: 'gsis' }],
      season: 'season',
      week: 'week',
      // `season_type` only exists from 2025; `game_type` (REG / WC / DIV / CON / SB) in every season
      seasonType: 'game_type',
      team: 'team'
    },
    (client, season) => client.nflverseCsv('injuries', `injuries_${season}`)
  ),
  depthChartsStep,
  rostersStep,
  combineStep,
  pbpStep
]
