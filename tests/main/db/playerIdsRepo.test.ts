import { beforeEach, describe, expect, it } from 'vitest'
import { openDatabase, type Db } from '@main/db/connection'
import { migrate } from '@main/db/migrate'
import { upsertLeague } from '@main/db/repos/leagues'
import {
  countPlayerIds,
  countUnresolvedRostered,
  getPlayerIds,
  listCrosswalk,
  listPlayerIdentitySources,
  listScoringIdentities,
  replaceCrosswalk,
  replacePlayerIds
} from '@main/db/repos/playerIds'
import { upsertPlayers } from '@main/db/repos/players'
import { replaceRosterPlayers, replaceTeams } from '@main/db/repos/teams'
import { parseCrosswalk } from '@main/sources/nflverse'
import { mapLeague, mapPlayers, mapRosterPlayers, mapTeams } from '@main/sync/mappers'
import { crosswalkCsv } from '../../fixtures/nflverse'
import * as fx from '../../fixtures/sleeper'

const TS = '2026-09-17T12:00:00.000Z'

describe('playerIds repo', () => {
  let db: Db
  beforeEach(() => {
    db = openDatabase(':memory:')
    migrate(db)
    upsertLeague(db, mapLeague(fx.league, TS), TS)
    replaceTeams(db, 'L1', mapTeams('L1', fx.rosters, fx.users, 'u1'), TS)
    replaceRosterPlayers(db, 'L1', mapRosterPlayers(fx.rosters), TS)
    upsertPlayers(db, mapPlayers(fx.players), TS)
  })

  it('replaceCrosswalk round-trips and is idempotent', () => {
    const rows = parseCrosswalk(crosswalkCsv).records
    expect(replaceCrosswalk(db, rows, TS)).toBe(5)
    expect(replaceCrosswalk(db, rows, TS)).toBe(5)
    expect(listCrosswalk(db)).toEqual(rows)
  })

  it('listPlayerIdentitySources exposes the Sleeper-side ids of every player', () => {
    const sources = listPlayerIdentitySources(db)
    expect(sources).toHaveLength(Object.keys(fx.players).length)
    expect(sources.find((s) => s.playerId === '4866')).toEqual({
      playerId: '4866',
      fullName: 'Saquon Barkley',
      position: 'RB',
      gsisId: '00-0034844',
      sportradarId: 'sr-1',
      espnId: '3929630'
    })
  })

  it('replacePlayerIds, getPlayerIds, listScoringIdentities, counts', () => {
    expect(countPlayerIds(db)).toBe(0)
    const n = replacePlayerIds(
      db,
      [
        {
          playerId: '4866',
          gsisId: '00-0034844',
          pfrId: 'BarkSa00',
          sportradarId: null,
          espnId: null,
          nflverseTeam: null,
          resolution: 'crosswalk'
        },
        {
          playerId: 'LAR',
          gsisId: null,
          pfrId: null,
          sportradarId: null,
          espnId: null,
          nflverseTeam: 'LA',
          resolution: 'team'
        },
        {
          playerId: '6794',
          gsisId: null,
          pfrId: null,
          sportradarId: null,
          espnId: null,
          nflverseTeam: null,
          resolution: 'unresolved'
        }
      ],
      TS
    )
    expect(n).toBe(3)
    expect(countPlayerIds(db)).toBe(3)
    expect(getPlayerIds(db, '4866')?.pfrId).toBe('BarkSa00')
    expect(getPlayerIds(db, 'nope')).toBeNull()
    expect(listScoringIdentities(db)).toEqual([
      { playerId: '4866', position: 'RB', gsisId: '00-0034844', nflverseTeam: null },
      { playerId: 'LAR', position: 'DEF', gsisId: null, nflverseTeam: 'LA' }
    ])
    // roster 1 = 4866, 6794, 8259, LAR; roster 2 = 7564, 9509. Unresolved or missing: 6794, 8259, 7564, 9509.
    expect(countUnresolvedRostered(db, 'L1')).toBe(4)
  })
})
