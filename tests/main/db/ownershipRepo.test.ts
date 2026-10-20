import { describe, expect, it } from 'vitest'
import { leagueOwnership } from '@main/db/repos/ownership'
import { replacePlayerIds, type PlayerIdRecord } from '@main/db/repos/playerIds'
import { seedLeague } from '../../fixtures/db'

const ids = (playerId: string, over: Partial<PlayerIdRecord>): PlayerIdRecord => ({
  playerId,
  gsisId: null,
  pfrId: null,
  sportradarId: null,
  espnId: null,
  nflverseTeam: null,
  resolution: 'crosswalk',
  ...over
})

describe('league ownership', () => {
  it('keys rostered players by gsis id and defenses by nflverse code', () => {
    const db = seedLeague()
    replacePlayerIds(
      db,
      [
        ids('4866', { gsisId: '00-0034844' }),
        ids('6794', { gsisId: '00-0036322' }),
        ids('7564', { gsisId: '00-0036900' }),
        ids('LAR', { nflverseTeam: 'LA', resolution: 'team' })
      ],
      't'
    )
    expect(leagueOwnership(db, 'L1')).toEqual({
      players: {
        '00-0034844': { name: 'Cook Book', mine: true },
        '00-0036322': { name: 'Cook Book', mine: true },
        '00-0036900': { name: 'Rival', mine: false }
      },
      teams: { LA: { name: 'Cook Book', mine: true } }
    })
  })

  it('is empty for another league', () => {
    expect(leagueOwnership(seedLeague(), 'L9')).toEqual({ players: {}, teams: {} })
  })
})
