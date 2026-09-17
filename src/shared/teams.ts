/** Sleeper's 32 NFL team codes (also its DEF player_ids). */
export const NFL_TEAMS = [
  'ARI',
  'ATL',
  'BAL',
  'BUF',
  'CAR',
  'CHI',
  'CIN',
  'CLE',
  'DAL',
  'DEN',
  'DET',
  'GB',
  'HOU',
  'IND',
  'JAX',
  'KC',
  'LAC',
  'LAR',
  'LV',
  'MIA',
  'MIN',
  'NE',
  'NO',
  'NYG',
  'NYJ',
  'PHI',
  'PIT',
  'SEA',
  'SF',
  'TB',
  'TEN',
  'WAS'
] as const

/** Where nflverse spells a team differently from Sleeper. Extend if a crosswalk mismatch shows up. */
export const SLEEPER_TO_NFLVERSE_TEAM: Record<string, string> = { LAR: 'LA' }

export function toNflverseTeam(sleeperTeam: string): string {
  return SLEEPER_TO_NFLVERSE_TEAM[sleeperTeam] ?? sleeperTeam
}
