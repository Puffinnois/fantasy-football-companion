import { describe, expect, it } from 'vitest'
import { DIVISIONS, divisionOf, STATS_TEAMS, TEAM_NAMES } from '@shared/stats/nflTeams'

describe('NFL teams as the stats rows key them', () => {
  it('has 32 teams in eight divisions of four, each named', () => {
    expect(Object.keys(DIVISIONS)).toHaveLength(8)
    expect(Object.values(DIVISIONS).every((d) => d.length === 4)).toBe(true)
    expect(STATS_TEAMS).toHaveLength(32)
    expect(STATS_TEAMS.filter((t) => !TEAM_NAMES[t])).toEqual([])
    expect(STATS_TEAMS.slice(0, 3)).toEqual(['ARI', 'ATL', 'BAL'])
  })

  it('uses nflverse codes and finds a team’s division', () => {
    expect(TEAM_NAMES.LA).toBe('Los Angeles Rams')
    expect(divisionOf('LA')).toBe('NFC West')
    expect(divisionOf('DET')).toBe('NFC North')
    expect(divisionOf('LAR')).toBeNull()
  })
})
