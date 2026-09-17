import { describe, expect, it } from 'vitest'
import { parseCrosswalk } from '@main/sources/nflverse'
import { normalizeName, resolvePlayer, resolvePlayers, indexCrosswalk } from '@main/sync/identity'
import type { PlayerIdentitySource } from '@main/db/repos/playerIds'
import { toNflverseTeam } from '@shared/teams'
import { crosswalkCsv } from '../../fixtures/nflverse'

const index = indexCrosswalk(parseCrosswalk(crosswalkCsv).records)

function src(
  overrides: Partial<PlayerIdentitySource> & { playerId: string }
): PlayerIdentitySource {
  return {
    fullName: '',
    position: null,
    gsisId: null,
    sportradarId: null,
    espnId: null,
    ...overrides
  }
}

describe('normalizeName', () => {
  it('lowercases, strips punctuation and generational suffixes', () => {
    expect(normalizeName("Ja'Marr Chase")).toBe('jamarr chase')
    expect(normalizeName('Odell Beckham Jr.')).toBe('odell beckham')
    expect(normalizeName('D.J. Moore')).toBe('dj moore')
    expect(normalizeName('Kenneth Walker III')).toBe('kenneth walker')
    expect(normalizeName('  Amon-Ra   St. Brown ')).toBe('amonra st brown')
  })
})

describe('resolvePlayer', () => {
  it('1. crosswalk row by sleeper_id wins and brings pfr/espn ids', () => {
    const r = resolvePlayer(
      src({ playerId: '4866', fullName: 'Saquon Barkley', position: 'RB', gsisId: '00-9999999' }),
      index
    )
    expect(r).toEqual({
      playerId: '4866',
      gsisId: '00-0034844',
      pfrId: 'BarkSa00',
      sportradarId: 'sr-1',
      espnId: '3929630',
      nflverseTeam: null,
      resolution: 'crosswalk'
    })
  })

  it("2. falls back to Sleeper's own gsis_id (trimmed) and enriches from the crosswalk by gsis", () => {
    const r = resolvePlayer(
      src({ playerId: '8259', fullName: 'James Cook', position: 'RB', gsisId: ' 00-0037248' }),
      index
    )
    expect(r).toMatchObject({ gsisId: '00-0037248', pfrId: 'CookJa01', resolution: 'sleeper_gsis' })
  })

  it('2b. a crosswalk row without gsis still yields pfr_id when Sleeper has the gsis', () => {
    const r = resolvePlayer(
      src({ playerId: '9509', fullName: 'Bijan Robinson', position: 'RB', gsisId: '00-0039013' }),
      index
    )
    expect(r).toMatchObject({ gsisId: '00-0039013', pfrId: 'RobiBi01', resolution: 'sleeper_gsis' })
  })

  it('3. matches on sportradar_id when there is no gsis on the Sleeper side', () => {
    const r = resolvePlayer(
      src({ playerId: '5555', fullName: 'Someone Else', position: 'RB', sportradarId: 'sr-3' }),
      index
    )
    expect(r).toMatchObject({
      gsisId: '00-0037248',
      pfrId: 'CookJa01',
      sportradarId: 'sr-3',
      resolution: 'sportradar'
    })
  })

  it('4. last resort: normalized name + position, flagged', () => {
    const r = resolvePlayer(
      src({ playerId: '7777', fullName: "JA'MARR CHASE", position: 'WR' }),
      index
    )
    expect(r).toMatchObject({ gsisId: '00-0036900', pfrId: 'ChasJa00', resolution: 'name' })
    const wrongPos = resolvePlayer(
      src({ playerId: '7778', fullName: "Ja'Marr Chase", position: 'TE' }),
      index
    )
    expect(wrongPos.resolution).toBe('unresolved')
  })

  it('keeps unresolved players with Sleeper-side ids intact', () => {
    const r = resolvePlayer(
      src({
        playerId: '1234',
        fullName: 'Retired Guy',
        position: 'QB',
        sportradarId: 'sr-x',
        espnId: '42'
      }),
      index
    )
    expect(r).toEqual({
      playerId: '1234',
      gsisId: null,
      pfrId: null,
      sportradarId: 'sr-x',
      espnId: '42',
      nflverseTeam: null,
      resolution: 'unresolved'
    })
  })

  it('team defenses map to the nflverse team code', () => {
    expect(resolvePlayer(src({ playerId: 'LAR', position: 'DEF' }), index)).toMatchObject({
      nflverseTeam: 'LA',
      gsisId: null,
      resolution: 'team'
    })
    expect(resolvePlayer(src({ playerId: 'KC', position: 'DEF' }), index)).toMatchObject({
      nflverseTeam: 'KC',
      resolution: 'team'
    })
    expect(toNflverseTeam('LAR')).toBe('LA')
    expect(toNflverseTeam('WAS')).toBe('WAS')
  })

  it('resolvePlayers resolves a batch in order', () => {
    const out = resolvePlayers(
      [
        src({ playerId: 'LAR', position: 'DEF' }),
        src({ playerId: '4866', fullName: 'Saquon Barkley', position: 'RB' })
      ],
      parseCrosswalk(crosswalkCsv).records
    )
    expect(out.map((r) => [r.playerId, r.resolution])).toEqual([
      ['LAR', 'team'],
      ['4866', 'crosswalk']
    ])
  })
})
