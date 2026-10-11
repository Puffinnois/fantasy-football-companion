import type { WhData, WhPlayerWeek, WhTeamWeek } from '@main/db/repos/warehouse'
import { parsePlayerCsv, parseTeamCsv } from './parse'

export const FF_OPPORTUNITY_SOURCE = 'ff_opportunity'

const isTeamColumn = (column: string): boolean => column.endsWith('_team')

function only(data: WhData, keep: (column: string) => boolean): WhData {
  return Object.fromEntries(Object.entries(data).filter(([column]) => keep(column)))
}

/**
 * ffverse `ep_weekly_{season}.csv` (spec §5, §10): every player row repeats its team's totals in
 * `*_team` columns. They become one team-week row per team (the first row seen; rows without a
 * player id still count), and the player rows keep the rest.
 */
export function parseFfOpportunity(
  csv: string,
  minSeason: number
): { playerWeeks: WhPlayerWeek[]; teamWeeks: WhTeamWeek[]; skipped: number } {
  const dims = { season: 'season', week: 'week', seasonType: null }
  const players = parsePlayerCsv(
    csv,
    {
      ...dims,
      source: FF_OPPORTUNITY_SOURCE,
      ids: [{ column: 'player_id', keyType: 'gsis' }],
      team: 'posteam'
    },
    minSeason
  )
  const teams = new Map<string, WhTeamWeek>()
  for (const t of parseTeamCsv(
    csv,
    { ...dims, source: FF_OPPORTUNITY_SOURCE, team: 'posteam' },
    minSeason
  ).rows) {
    const key = `${t.season}|${t.seasonType}|${t.week}|${t.team}`
    if (!teams.has(key)) teams.set(key, { ...t, data: only(t.data, isTeamColumn) })
  }
  return {
    playerWeeks: players.rows.map((r) => ({ ...r, data: only(r.data, (c) => !isTeamColumn(c)) })),
    teamWeeks: [...teams.values()],
    skipped: players.skipped
  }
}
