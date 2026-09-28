import { describe, expect, it } from 'vitest'
import type { LineupBuild } from '@main/lineup/build'
import { myTeam } from '@main/trade/evaluate'
import type { PlayerSeries } from '@main/value/series'
import {
  applyRelease,
  compareReleases,
  releaseCandidates,
  type IrSettings,
  type ReleaseCandidate
} from '@main/waiver/release'
import type { PlayerValueRow } from '@shared/types'
import {
  syntheticBuild,
  WAIVER_LEAGUE,
  waiverLeagueWith,
  type SyntheticLeague
} from '../../fixtures/synthetic'

const A = { id: 'A', position: 'RB', weekly: 20, market: 5000 }
const C = { id: 'C', position: 'RB', weekly: 12, market: 2000 }
const B = { id: 'B', position: 'WR', weekly: 10, market: 1500 }
const D_OUT = { id: 'D', position: 'WR', weekly: 5, market: 300, injuryStatus: 'Out' }

const label = (r: ReleaseCandidate): string =>
  r.release.kind === 'open' ? 'open' : `${r.release.kind} ${r.release.playerId}`

function candidates(league: SyntheticLeague, ir: IrSettings = {}): string[] {
  const { build } = syntheticBuild(league)
  const roster = build.rosters.get(myTeam(build).rosterId) ?? []
  return releaseCandidates(build, roster, ir).map(label).sort()
}

describe('release candidates (slice 6c spec §2.2)', () => {
  it('offers a drop of every active player when the roster is full', () => {
    expect(candidates(WAIVER_LEAGUE)).toEqual(['drop A', 'drop B', 'drop C', 'drop D'])
  })

  it('offers only the open spot when the roster has room', () => {
    expect(candidates(waiverLeagueWith([A, C, B]))).toEqual(['open'])
  })

  it('adds an IR move for an injured player whose status the league allows on IR', () => {
    const league = waiverLeagueWith([A, C, B, D_OUT])
    expect(candidates(league, { irSlots: 1, irStatuses: ['IR', 'Out'] })).toEqual([
      'drop A',
      'drop B',
      'drop C',
      'drop D',
      'ir D'
    ])
    // status not allowed, no IR slots, or the IR slot already taken → no IR move
    expect(candidates(league, { irSlots: 1, irStatuses: ['IR'] })).not.toContain('ir D')
    expect(candidates(league, {})).not.toContain('ir D')
    const full = waiverLeagueWith([
      A,
      C,
      B,
      D_OUT,
      { id: 'E', position: 'RB', weekly: 1, slot: 'ir', injuryStatus: 'IR' }
    ])
    expect(candidates(full, { irSlots: 1, irStatuses: ['IR', 'Out'] })).toEqual([
      'drop A',
      'drop B',
      'drop C',
      'drop D'
    ])
  })

  it('applies a drop by removing the player and an IR move by changing his slot', () => {
    const { build } = syntheticBuild(WAIVER_LEAGUE)
    const roster = build.rosters.get(1) ?? []
    const d = roster.find((s) => s.base.playerId === 'D') as PlayerSeries
    const dropped = applyRelease(roster, { release: { kind: 'drop', playerId: 'D' }, series: d })
    expect(dropped.map((s) => s.base.playerId).sort()).toEqual(['A', 'B', 'C'])
    const moved = applyRelease(roster, { release: { kind: 'ir', playerId: 'D' }, series: d })
    expect(moved.find((s) => s.base.playerId === 'D')?.rosterSlot).toBe('ir')
    expect(moved.filter((s) => s.base.playerId !== 'D')).toEqual(
      roster.filter((s) => s.base.playerId !== 'D')
    )
    expect(applyRelease(roster, { release: { kind: 'open' }, series: null })).toBe(roster)
  })
})

describe('release tie order (spec §2.3 step 4)', () => {
  const series = (id: string): PlayerSeries =>
    ({ base: { playerId: id, fullName: id } }) as unknown as PlayerSeries
  const expert = (ecrRank: number): PlayerValueRow['expert'] => ({
    ecrRank,
    ecrPosRank: 1,
    spread: null,
    experts: 10,
    ecrDelta: null
  })
  const market = (value: number): PlayerValueRow['market'] => ({
    value,
    posRank: 1,
    tier: null,
    trend30d: 0
  })
  const build = {
    rowById: new Map<string, Partial<PlayerValueRow>>([
      ['m1', { market: market(100) }],
      ['m2', { market: market(900) }],
      ['r1', { expert: expert(50) }],
      ['r2', { expert: expert(200) }],
      ['u', { rosPoints: 30 }],
      ['p', { rosPoints: 10 }]
    ])
  } as unknown as LineupBuild
  const drop = (id: string): ReleaseCandidate => ({
    release: { kind: 'drop', playerId: id },
    series: series(id)
  })

  it('puts the open spot and IR first, then drops the least upside: market, worst rank, fewest points, name', () => {
    const list: ReleaseCandidate[] = [
      drop('m2'),
      drop('r1'),
      drop('u'),
      { release: { kind: 'ir', playerId: 'x' }, series: series('x') },
      drop('b'),
      drop('m1'),
      drop('p'),
      { release: { kind: 'open' }, series: null },
      drop('r2'),
      drop('a')
    ]
    const order = [...list].sort((x, y) => compareReleases(build, x, y)).map(label)
    expect(order).toEqual([
      'open',
      'ir x',
      'drop a',
      'drop b',
      'drop p',
      'drop u',
      'drop r2',
      'drop r1',
      'drop m1',
      'drop m2'
    ])
  })
})
