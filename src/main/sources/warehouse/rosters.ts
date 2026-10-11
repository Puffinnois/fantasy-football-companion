import type { WhData, WhPlayer, WhPlayerWeek } from '@main/db/repos/warehouse'
import { parsePlayerCsv, type Parsed, type PlayerCsvSpec } from './parse'

export const ROSTERS_SOURCE = 'rosters'

const ROSTER_SPEC: PlayerCsvSpec = {
  source: ROSTERS_SOURCE,
  ids: [{ column: 'gsis_id', keyType: 'gsis' }],
  season: 'season',
  week: 'week',
  seasonType: 'game_type',
  team: 'team'
}

/** Columns that describe the player rather than his week; the latest roster row supplies them. */
const BIO_COLUMNS = [
  'full_name',
  'first_name',
  'last_name',
  'football_name',
  'birth_date',
  'height',
  'weight',
  'college',
  'position',
  'gsis_id',
  'sleeper_id',
  'espn_id',
  'pfr_id',
  'sportradar_id',
  'years_exp',
  'entry_year',
  'rookie_year',
  'draft_club',
  'draft_number',
  'headshot_url'
]

/** season × 100 + week: orders roster rows across seasons (`upsertWhPlayersLatest` compares it). */
export function asOf(r: { season: number; week: number }): number {
  return r.season * 100 + r.week
}

/** `roster_weekly_{season}`: every player-week, plus each player's latest bio for `wh_player`. */
export function parseRosters(
  csv: string,
  minSeason: number
): { weeks: Parsed<WhPlayerWeek>; bios: WhPlayer[] } {
  const weeks = parsePlayerCsv(csv, ROSTER_SPEC, minSeason)
  const latest = new Map<string, WhPlayerWeek>()
  for (const r of weeks.rows) {
    const prev = latest.get(r.playerKey)
    if (!prev || asOf(r) >= asOf(prev)) latest.set(r.playerKey, r)
  }
  const bios = [...latest.values()].map((r): WhPlayer => {
    const data: WhData = { as_of: asOf(r) }
    for (const column of BIO_COLUMNS) {
      const value = r.data[column]
      if (value !== undefined) data[column] = value
    }
    return { source: ROSTERS_SOURCE, playerKey: r.playerKey, keyType: 'gsis', data }
  })
  return { weeks, bios }
}
