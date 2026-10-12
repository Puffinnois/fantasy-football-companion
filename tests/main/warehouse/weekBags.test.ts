import { describe, expect, it } from 'vitest'
import { PlayerBags, TeamBags } from '@main/warehouse/weekBags'
import { play } from '../../fixtures/pbp'

const week1 = play({})
const week2 = play({ week: 2 })

describe('PlayerBags', () => {
  it('keeps one bag per player and week, with the first team seen and its opponent', () => {
    const bags = new PlayerBags('part')
    bags.bag(week1, 'a', null).add('off_snaps')
    bags.bag(week1, 'a', 'PHI').add('off_snaps')
    bags.bag(week2, 'a', 'DAL').add('off_snaps')
    bags.bag(week2, 'b', 'PHI').add('nothing', 0)
    expect(bags.finish()).toEqual([
      {
        source: 'part',
        season: 2025,
        seasonType: 'REG',
        week: 1,
        playerKey: 'a',
        keyType: 'gsis',
        team: 'PHI',
        opponent: 'DAL',
        data: { off_snaps: 2 }
      },
      {
        source: 'part',
        season: 2025,
        seasonType: 'REG',
        week: 2,
        playerKey: 'a',
        keyType: 'gsis',
        team: 'DAL',
        opponent: 'PHI',
        data: { off_snaps: 1 }
      }
    ])
  })
})

describe('TeamBags', () => {
  it('writes to the offense’s off_ bag and the defense’s def_ bag', () => {
    const bags = new TeamBags('ftn')
    for (const b of bags.both(week1, 'PHI', 'DAL')) b.add('motion')
    for (const b of bags.both(week1, 'DAL', 'PHI')) b.add('rpo')
    expect(bags.finish()).toEqual([
      {
        source: 'ftn',
        season: 2025,
        seasonType: 'REG',
        week: 1,
        team: 'PHI',
        opponent: 'DAL',
        data: { off_motion: 1, def_rpo: 1 }
      },
      {
        source: 'ftn',
        season: 2025,
        seasonType: 'REG',
        week: 1,
        team: 'DAL',
        opponent: 'PHI',
        data: { off_rpo: 1, def_motion: 1 }
      }
    ])
  })
})
