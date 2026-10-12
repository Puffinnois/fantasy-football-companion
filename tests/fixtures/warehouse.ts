import { readFileSync } from 'node:fs'
import type { WarehouseClient } from '@main/sources/warehouse/client'
import { FF_OPPORTUNITY_URL } from '@main/sync/warehouseSteps'

/** A captured live file under tests/fixtures/warehouse/ (see capture.sh there). */
export const captured = (name: string): string =>
  readFileSync(new URL(`./warehouse/${name}`, import.meta.url), 'utf8')

/** A captured nflverse file under tests/fixtures/nflverse/ (2025 rows, every column). */
export const capturedNflverse = (name: string): string =>
  readFileSync(new URL(`./nflverse/${name}`, import.meta.url), 'utf8')

export interface FakeWarehouse extends WarehouseClient {
  /** Every request, in order: `<tag>/<name>`, a URL, or `sleeper:<season>/<week>/<type>`. */
  calls: string[]
}

/**
 * Serves `files` by `<tag>/<name>` (nflverse) or full URL (other files); anything else is unpublished.
 * Sleeper weeks come from `sleeper`, keyed `<season>/<week>/<type>`; other weeks are empty.
 */
export function fakeWarehouse(
  files: Record<string, string> = {},
  sleeper: Record<string, unknown[]> = {}
): FakeWarehouse {
  const calls: string[] = []
  return {
    calls,
    async nflverseCsv(tag, name) {
      calls.push(`${tag}/${name}`)
      return files[`${tag}/${name}`] ?? null
    },
    async nflverseFile(tag, name) {
      calls.push(`${tag}/${name}`)
      const file = files[`${tag}/${name}`]
      return file === undefined ? null : new TextEncoder().encode(file)
    },
    async text(url) {
      calls.push(url)
      return files[url] ?? null
    },
    async sleeperStats(season, week, seasonType) {
      const key = `${season}/${week}/${seasonType}`
      calls.push(`sleeper:${key}`)
      return sleeper[key] ?? []
    }
  }
}

/** Every captured file, under the name its warehouse step asks for. */
export function capturedFiles(): Record<string, string> {
  const files: Record<string, string> = {
    'stats_player/stats_player_week_2025': capturedNflverse('stats_player_week.csv'),
    'stats_team/stats_team_week_2025': capturedNflverse('stats_team_week.csv'),
    'snap_counts/snap_counts_2025': capturedNflverse('snap_counts.csv'),
    'schedules/games': capturedNflverse('games.csv'),
    [`${FF_OPPORTUNITY_URL}/ep_weekly_2025.csv`]: captured('ep_weekly_2025.csv'),
    'nextgen_stats/ngs_passing': captured('ngs_passing.csv'),
    'nextgen_stats/ngs_rushing': captured('ngs_rushing.csv'),
    'nextgen_stats/ngs_receiving': captured('ngs_receiving.csv'),
    'espn_data/qbr_week_level': captured('qbr_week_level.csv'),
    'espn_data/qbr_season_level': captured('qbr_season_level.csv'),
    'injuries/injuries_2025': captured('injuries_2025.csv'),
    'depth_charts/depth_charts_2024': captured('depth_charts_2024.csv'),
    'weekly_rosters/roster_weekly_2025': captured('roster_weekly_2025.csv'),
    'combine/combine': captured('combine.csv'),
    'pbp/play_by_play_2025': captured('pbp_2025_game.csv'),
    'ftn_charting/ftn_charting_2025': captured('ftn_2025_game.csv'),
    'pbp_participation/pbp_participation_2025': captured('part_2025_game.csv')
  }
  for (const kind of ['pass', 'rush', 'rec', 'def']) {
    files[`pfr_advstats/advstats_week_${kind}_2025`] = captured(`advstats_week_${kind}_2025.csv`)
  }
  return files
}

/** The captured Sleeper week (2025 week 5, regular season). */
export function capturedSleeper(): Record<string, unknown[]> {
  return { '2025/5/regular': JSON.parse(captured('sleeper_stats_2025_5.json')) as unknown[] }
}
