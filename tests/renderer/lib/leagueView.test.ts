import { describe, expect, it } from 'vitest'
import {
  initials,
  lastWeekTrend,
  ordinal,
  recordText,
  rosTier,
  rosTierLine,
  signedOne,
  sortTeams,
  standLine,
  STRENGTH_NOTE,
  teamLabel,
  TEAM_SORTS
} from '@/lib/leagueView'
import { team } from '../../fixtures/league'
import { teamStrength } from '../../fixtures/lineup'

const unranked = { thisWeek: null, rosTotal: null, rosPerWeek: null, rank: null }

describe('leagueView', () => {
  it('labels a team by its team name, else by its owner', () => {
    expect(teamLabel(team({ teamName: 'Cook Book', displayName: 'puffinn' }))).toBe('Cook Book')
    expect(teamLabel(team({ teamName: null, displayName: 'puffinn' }))).toBe('puffinn')
  })

  it('sorts by record: wins, then ties, then points for, whoever is me', () => {
    const me = team({ rosterId: 1, teamName: 'Me', wins: 1, losses: 1, fpts: 250, isMe: true })
    const top = team({ rosterId: 2, teamName: 'Top', wins: 2, losses: 0, fpts: 240 })
    const tied = team({ rosterId: 3, teamName: 'Tied', wins: 1, losses: 1, fpts: 260 })
    const tie1 = team({ rosterId: 4, teamName: 'Tie', wins: 1, losses: 0, ties: 1, fpts: 100 })
    const order = sortTeams([me, top, tied, tie1], [], 'record').map((t) => t.teamName)
    expect(order).toEqual(['Top', 'Tie', 'Tied', 'Me'])
  })

  it('sorts by ROS rank with unranked teams last, in record order', () => {
    const a = team({ rosterId: 1, teamName: 'A', wins: 2 })
    const b = team({ rosterId: 2, teamName: 'B', wins: 1 })
    const c = team({ rosterId: 3, teamName: 'C', wins: 0 })
    const d = team({ rosterId: 4, teamName: 'D', wins: 3 })
    const strengths = [
      teamStrength({ rosterId: 1, rank: 2 }),
      teamStrength({ rosterId: 2, rank: 1 }),
      teamStrength({ rosterId: 3, ...unranked }),
      teamStrength({ rosterId: 4, ...unranked })
    ]
    const order = sortTeams([a, b, c, d], strengths, 'strength').map((t) => t.teamName)
    expect(order).toEqual(['B', 'A', 'D', 'C'])
    expect(sortTeams([a, b, c, d], [], 'strength').map((t) => t.teamName)).toEqual([
      'D',
      'A',
      'B',
      'C'
    ])
  })

  it('does not mutate the input list', () => {
    const teams = [team({ rosterId: 1, wins: 0 }), team({ rosterId: 2, wins: 1 })]
    sortTeams(teams, [], 'record')
    expect(teams.map((t) => t.rosterId)).toEqual([1, 2])
  })

  it('exposes the two sorts and the basis note', () => {
    expect(TEAM_SORTS).toEqual([
      { key: 'record', label: 'By record' },
      { key: 'strength', label: 'Rest of season' }
    ])
    expect(STRENGTH_NOTE).toBe(
      'Optimal lineup on Sleeper projections under your scoring, summed over the remaining weeks'
    )
  })

  it('tiers ROS ranks by thirds of the league', () => {
    expect([1, 4, 5, 8, 9, 12].map((r) => rosTier(r, 12))).toEqual([
      'good',
      'good',
      'mid',
      'mid',
      'bad',
      'bad'
    ])
    expect(rosTier(null, 12)).toBe('none')
    expect(rosTier(1, 2)).toBe('good')
    expect(rosTierLine('good', 12)).toBe('Top-4 roster for the rest of the season')
    expect(rosTierLine('bad', 10)).toBe('Bottom-3 roster for the rest of the season')
    expect(rosTierLine('none', 10)).toBe('No rest-of-season outlook yet')
  })

  it('writes ordinals, initials, records and signed one-decimal numbers', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 101].map(ordinal)).toEqual([
      '1st',
      '2nd',
      '3rd',
      '4th',
      '11th',
      '12th',
      '13th',
      '21st',
      '22nd',
      '101st'
    ])
    expect(initials('Cook Book Club')).toBe('CB')
    expect(initials('  ')).toBe('?')
    expect(recordText(team({ wins: 4, losses: 2 }))).toBe('4-2')
    expect(recordText(team({ wins: 4, losses: 1, ties: 1 }))).toBe('4-1-1')
    expect([12.34, -3, 0].map(signedOne)).toEqual(['+12.3', '−3.0', '±0.0'])
  })

  it('states where the team stands against the playoff line', () => {
    const standings = [
      team({ rosterId: 1, wins: 5, losses: 0 }),
      team({ rosterId: 2, wins: 4, losses: 1 }),
      team({ rosterId: 3, wins: 2, losses: 3 }),
      team({ rosterId: 4, wins: 2, losses: 3 }),
      team({ rosterId: 5, wins: 0, losses: 5 })
    ]
    expect(standLine(standings, 1, 2)).toBe('Leading the league at 1st of 5')
    expect(standLine(standings, 2, 2)).toBe('In a playoff spot, 2nd of 5')
    expect(standLine(standings, 3, 2)).toBe('2 games out of the last playoff spot')
    expect(standLine(standings, 4, 3)).toBe('Tied with the last playoff spot, 4th of 5')
  })

  it('compares last week with the season average, ±3 points', () => {
    expect(lastWeekTrend(60, 15, 5)).toBe('up')
    expect(lastWeekTrend(60, 9, 5)).toBe('down')
    expect(lastWeekTrend(60, 12, 5)).toBe('flat')
    expect(lastWeekTrend(null, 12, 5)).toBeNull()
    expect(lastWeekTrend(60, null, 5)).toBeNull()
  })
})
