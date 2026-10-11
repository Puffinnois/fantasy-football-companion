import type { WhData, WhPlayerWeek, WhSeasonType, WhTeamWeek } from '@main/db/repos/warehouse'
import { NFL_TEAMS, toNflverseTeam } from '@shared/teams'

/** Sleeper DEF ids are team codes; team-offense rows are `TEAM_<code>`. */
const TEAM_CODES: ReadonlySet<string> = new Set(NFL_TEAMS)
const TEAM_ROW = 'TEAM_'

export interface SleeperStatsRows {
  players: WhPlayerWeek[]
  /** Fantasy DST lines → `sleeper_def`. */
  defs: WhTeamWeek[]
  /** Team offense → `sleeper_team`. */
  teams: WhTeamWeek[]
  skipped: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** The non-zero numeric entries of a row's `stats` object (spec §10). */
function numbers(stats: unknown): WhData {
  const data: WhData = {}
  if (!isRecord(stats)) return data
  for (const [key, value] of Object.entries(stats)) {
    if (typeof value === 'number' && Number.isFinite(value) && value !== 0) data[key] = value
  }
  return data
}

function teamCode(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? toNflverseTeam(value) : null
}

/** One week's response from `api.sleeper.com/stats/nfl/{season}/{week}` (spec §5). */
export function parseSleeperStats(
  rows: unknown[],
  season: number,
  week: number,
  seasonType: WhSeasonType
): SleeperStatsRows {
  const out: SleeperStatsRows = { players: [], defs: [], teams: [], skipped: 0 }
  for (const row of rows) {
    const id = isRecord(row) ? row.player_id : undefined
    if (!isRecord(row) || typeof id !== 'string' || id === '') {
      out.skipped++
      continue
    }
    const data = numbers(row.stats)
    const opponent = teamCode(row.opponent)
    if (TEAM_CODES.has(id)) {
      out.defs.push({
        source: 'sleeper_def',
        season,
        seasonType,
        week,
        team: toNflverseTeam(id),
        opponent,
        data
      })
    } else if (id.startsWith(TEAM_ROW)) {
      const team = toNflverseTeam(id.slice(TEAM_ROW.length))
      out.teams.push({ source: 'sleeper_team', season, seasonType, week, team, opponent, data })
    } else {
      out.players.push({
        source: 'sleeper',
        season,
        seasonType,
        week,
        playerKey: id,
        keyType: 'sleeper',
        team: teamCode(row.team),
        opponent,
        data
      })
    }
  }
  return out
}
