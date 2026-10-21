import { describe, expect, it } from 'vitest'
import { leagueOwnership, playerLink } from '@main/db/repos/ownership'
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

describe('the same player in both products', () => {
  const seeded = (): ReturnType<typeof seedLeague> => {
    const db = seedLeague()
    replacePlayerIds(
      db,
      [
        // 7564 is on a roster; 1234 shares his gsis id and is on none.
        ids('1234', { gsisId: '00-0036900' }),
        ids('7564', { gsisId: '00-0036900' }),
        ids('LAR', { nflverseTeam: 'LA', resolution: 'team' }),
        ids('9509', { resolution: 'unresolved' })
      ],
      't'
    )
    return db
  }

  it('finds a Sleeper id’s gsis id, or a defense’s team', () => {
    const db = seeded()
    expect(playerLink(db, { sleeper: '7564' })).toEqual({
      sleeper: '7564',
      gsis: '00-0036900',
      team: null
    })
    expect(playerLink(db, { sleeper: 'LAR' })).toEqual({ sleeper: 'LAR', gsis: null, team: 'LA' })
    expect(playerLink(db, { sleeper: '9509' })).toBeNull()
    expect(playerLink(db, { sleeper: 'nope' })).toBeNull()
  })

  it('finds a gsis id’s Sleeper id, the rostered one first', () => {
    const db = seeded()
    expect(playerLink(db, { gsis: '00-0036900' })).toEqual({
      sleeper: '7564',
      gsis: '00-0036900',
      team: null
    })
    expect(playerLink(db, { gsis: '00-0000000' })).toBeNull()
  })
})
