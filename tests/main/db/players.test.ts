import { describe, expect, it } from 'vitest'
import { listCandidates } from '@main/db/repos/playersWeek'
import { upsertPlayers } from '@main/db/repos/players'
import { seedLeague, SEED_TS } from '../../fixtures/db'

describe('players repo injury detail', () => {
  it('round-trips status, body part and notes into the candidate rows', () => {
    const db = seedLeague()
    upsertPlayers(
      db,
      [
        {
          playerId: '4866',
          fullName: 'Saquon Barkley',
          firstName: 'Saquon',
          lastName: 'Barkley',
          position: 'RB',
          fantasyPositions: ['RB'],
          team: 'PHI',
          status: 'Injured Reserve',
          injuryStatus: 'IR',
          injuryBodyPart: 'Knee - ACL',
          injuryNotes: 'Surgery',
          age: null,
          yearsExp: null,
          depthChartOrder: null,
          searchRank: null,
          gsisId: null,
          sportradarId: null,
          espnId: null
        }
      ],
      SEED_TS
    )
    const row = listCandidates(db, 'L1').find((r) => r.player_id === '4866')
    expect(row).toMatchObject({
      status: 'Injured Reserve',
      injury_status: 'IR',
      injury_body_part: 'Knee - ACL',
      injury_notes: 'Surgery'
    })
  })
})
