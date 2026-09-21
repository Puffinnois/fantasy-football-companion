import { describe, expect, it } from 'vitest'
import { rosLine, sortTeams, STRENGTH_NOTE, teamLabel, TEAM_SORTS } from '@/lib/leagueView'
import { team } from '../../fixtures/league'
import { teamStrength } from '../../fixtures/lineup'

const unranked = { thisWeek: null, rosTotal: null, rosPerWeek: null, rank: null }

describe('leagueView', () => {
  it('labels a team by its team name, else by its owner', () => {
    expect(teamLabel(team({ teamName: 'Cook Book', displayName: 'puffinn' }))).toBe('Cook Book')
    expect(teamLabel(team({ teamName: null, displayName: 'puffinn' }))).toBe('puffinn')
  })

  it('writes the ROS line with two decimals and the rank, or a dash', () => {
    expect(rosLine(teamStrength({ rosTotal: 1234.5, rank: 3 }))).toBe('ROS 1234.50 · #3')
    expect(rosLine(teamStrength(unranked))).toBe('ROS —')
    expect(rosLine(undefined)).toBe('ROS —')
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
      { key: 'record', label: 'Record' },
      { key: 'strength', label: 'ROS strength' }
    ])
    expect(STRENGTH_NOTE).toBe(
      'Optimal lineup on Sleeper projections under your scoring, summed over the remaining weeks'
    )
  })
})
