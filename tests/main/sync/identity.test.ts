import { describe, expect, it } from 'vitest'
import { parseCrosswalk } from '@main/sources/nflverse'
import {
  canonicalName,
  indexCrosswalk,
  nameKey,
  normalizeName,
  positionGroup,
  resolvePlayer,
  resolvePlayers
} from '@main/sync/identity'
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

describe('nameKey (coverage audit fix 4)', () => {
  it('spells out nickname first names and groups line and defensive positions', () => {
    expect(canonicalName('Matt Hibner')).toBe('matthew hibner')
    expect(canonicalName('Matthew Hibner')).toBe('matthew hibner')
    expect(canonicalName('Matt')).toBe('matt')
    expect(positionGroup('G')).toBe('OL')
    expect(positionGroup('OL')).toBe('OL')
    expect(positionGroup('TE')).toBe('TE')
    expect(positionGroup('DT')).toBe('DL')
    expect(positionGroup('CB')).toBe('DB')
    expect(positionGroup('OLB')).toBe('LB')
    expect(nameKey('Brandon Coleman', 'OL')).toBe(nameKey('Brandon Coleman', 'G'))
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

  it('5. last resort: name + position against the nflverse stats rows (rookies missing from the crosswalk)', () => {
    const nflverse = [
      { gsisId: '00-0040878', name: 'Mike Washington Jr.', position: 'RB' },
      { gsisId: '00-0041000', name: 'Trey Smack', position: 'K' }
    ]
    const withStats = indexCrosswalk(parseCrosswalk(crosswalkCsv).records, nflverse)
    // crosswalk row exists (sleeper_id 13305) but its gsis is a placeholder -> falls through to nflverse by name
    const washington = resolvePlayer(
      src({ playerId: '13305', fullName: 'Mike Washington', position: 'RB' }),
      withStats
    )
    expect(washington).toMatchObject({
      gsisId: '00-0040878',
      pfrId: 'WashMi21',
      resolution: 'name'
    })
    const smack = resolvePlayer(
      src({ playerId: '13545', fullName: 'Trey Smack', position: 'K' }),
      withStats
    )
    expect(smack).toMatchObject({ gsisId: '00-0041000', pfrId: null, resolution: 'name' })
    expect(
      resolvePlayer(src({ playerId: '13545', fullName: 'Trey Smack', position: 'K' }), index)
        .resolution
    ).toBe('unresolved')
  })

  it('6. matches a nickname and a line position against nflverse (coverage audit fix 4)', () => {
    const nflverse = [
      { gsisId: '00-0040879', name: 'Matthew Hibner', position: 'TE' },
      { gsisId: '00-0039913', name: 'Brandon Coleman', position: 'G' }
    ]
    const withStats = indexCrosswalk(parseCrosswalk(crosswalkCsv).records, nflverse)
    expect(
      resolvePlayer(src({ playerId: '13324', fullName: 'Matt Hibner', position: 'TE' }), withStats)
    ).toMatchObject({ gsisId: '00-0040879', resolution: 'name' })
    expect(
      resolvePlayer(
        src({ playerId: '11702', fullName: 'Brandon Coleman', position: 'OL' }),
        withStats
      )
    ).toMatchObject({ gsisId: '00-0039913', resolution: 'name' })
  })

  it('never takes a name match that belongs to another Sleeper player (review of Plan X)', () => {
    const owned = {
      sleeperId: '7000',
      fantasyprosId: null,
      gsisId: '00-0036001',
      pfrId: 'JoneTo01',
      sportradarId: null,
      espnId: null,
      name: 'Tony Jones Jr.',
      position: 'RB'
    }
    const nflverse = [{ gsisId: '00-0036001', name: 'Tony Jones', position: 'RB' }]
    const withOwner = indexCrosswalk([owned], nflverse)
    // "Anthony Jones" canonicalises like "Tony Jones", but that row and gsis are Sleeper 7000's.
    expect(
      resolvePlayer(src({ playerId: '7424', fullName: 'Anthony Jones', position: 'RB' }), withOwner)
        .resolution
    ).toBe('unresolved')
    expect(
      resolvePlayer(
        src({ playerId: '7000', fullName: 'Tony Jones Jr.', position: 'RB' }),
        withOwner
      )
    ).toMatchObject({ gsisId: '00-0036001', resolution: 'crosswalk' })
  })

  it('ignores malformed Sleeper gsis ids', () => {
    const r = resolvePlayer(
      src({ playerId: '9', fullName: 'Nobody Here', position: 'QB', gsisId: 'WAS123456' }),
      index
    )
    expect(r).toMatchObject({ gsisId: null, resolution: 'unresolved' })
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
      parseCrosswalk(crosswalkCsv).records,
      []
    )
    expect(out.map((r) => [r.playerId, r.resolution])).toEqual([
      ['LAR', 'team'],
      ['4866', 'crosswalk']
    ])
  })
})
