import { describe, expect, it } from 'vitest'
import type { GameRow } from '@main/db/repos/stats'
import type { IrSettings } from '@main/waiver/release'
import { waiverContext, type WaiverContext } from '@main/waiver/search'
import { streamRows, waiverStream, weekOpponents } from '@main/waiver/stream'
import type { StreamOption, StreamRow } from '@shared/types'
import { SEASON } from '../../fixtures/season'
import {
  syntheticBuild,
  WAIVER_LEAGUE,
  waiverLeagueWith,
  type SyntheticLeague
} from '../../fixtures/synthetic'

const A = { id: 'A', position: 'RB', weekly: 20, market: 5000 }
const C = { id: 'C', position: 'RB', weekly: 12, market: 2000 }
const B = { id: 'B', position: 'WR', weekly: 10, market: 1500 }

function ctxOf(league: SyntheticLeague, ir: IrSettings = {}): WaiverContext {
  return waiverContext(syntheticBuild(league).build, ir)
}
const summary = (options: StreamOption[]): [string, number, number, number][] =>
  options.map((o) => [
    o.release.kind === 'open' ? 'open' : `${o.release.kind} ${o.release.playerId}`,
    o.weekGain,
    o.restCost,
    o.net
  ])
const ids = (rows: StreamRow[]): string[] => rows.map((r) => r.player.playerId)
function game(week: number, homeTeam: string, awayTeam: string): GameRow {
  return {
    gameId: `${SEASON}_${week}_${awayTeam}_${homeTeam}`,
    season: SEASON,
    week,
    gameType: 'REG',
    gameday: null,
    gametime: null,
    homeTeam,
    awayTeam,
    homeScore: null,
    awayScore: null
  }
}

describe('streaming (slice 6c spec §4)', () => {
  it('nets the week gain against what each release costs in the other window weeks', () => {
    const rows = streamRows(ctxOf(WAIVER_LEAGUE), 16, new Map())
    // Y (3 in week 16) can't start; Z, K, W, Q never can.
    expect(ids(rows)).toEqual(['X'])
    expect(summary(rows[0].options)).toEqual([
      ['drop D', 1, 0, 1],
      ['drop B', 1, 5, -4],
      ['drop C', -1, 7, -8],
      ['drop A', -9, 15, -24]
    ])
    expect(rows[0].options[0].releasePlayer).toMatchObject({ playerId: 'D', starterWeeks: 0 })
    expect(rows[0].options[3].releasePlayer).toMatchObject({ playerId: 'A', starterWeeks: 2 })
    expect(rows[0].player).toMatchObject({ playerId: 'X', starterWeeks: 0 })
    // No schedule in the fixture: the projection's bare opponent code.
    expect(rows[0].opponent).toBe('OPP')
  })

  it('ranks a later week by net', () => {
    const rows = streamRows(ctxOf(WAIVER_LEAGUE), 17, new Map())
    expect(ids(rows)).toEqual(['Y', 'X'])
    expect(summary(rows[0].options)).toEqual([
      ['drop D', 13, 0, 13],
      ['drop C', 13, 7, 6],
      ['drop B', 8, 5, 3],
      ['drop A', 5, 15, -10]
    ])
  })

  it('offers only the open spot, at no rest cost, when my roster has room', () => {
    const rows = streamRows(ctxOf(waiverLeagueWith([A, C, B])), 16, new Map())
    expect(ids(rows)).toEqual(['X'])
    expect(summary(rows[0].options)).toEqual([['open', 1, 0, 1]])
  })

  it('puts an IR move ahead of dropping the same injured player, from the league settings', () => {
    const league = waiverLeagueWith([
      A,
      C,
      B,
      { id: 'D', position: 'WR', weekly: 5, market: 300, injuryStatus: 'Out' }
    ])
    const rows = waiverStream(syntheticBuild(league).build, 16, {
      settings: { irSlots: 1, irStatuses: ['IR', 'Out'] },
      opponents: new Map()
    })
    expect(summary(rows[0].options)).toEqual([
      ['ir D', 1, 0, 1],
      ['drop D', 1, 0, 1],
      ['drop B', 1, 5, -4],
      ['drop C', -1, 7, -8],
      ['drop A', -9, 15, -24]
    ])
  })

  it('skips a streamer whose game that week is already played', () => {
    const league: SyntheticLeague = {
      ...WAIVER_LEAGUE,
      freeAgents: WAIVER_LEAGUE.freeAgents?.map((p) => (p.id === 'X' ? { ...p, points: 11 } : p))
    }
    const ctx = ctxOf(league)
    expect(ids(streamRows(ctx, 16, new Map()))).toEqual([])
    expect(ids(streamRows(ctx, 17, new Map()))).toEqual(['Y', 'X'])
  })

  it('lists nobody below the net threshold', () => {
    const league = { ...WAIVER_LEAGUE, freeAgents: [{ id: 'X', position: 'WR', weekly: 10.3 }] }
    expect(streamRows(ctxOf(league), 16, new Map())).toEqual([])
  })

  it('labels home and away opponents from the week’s games', () => {
    const labels = weekOpponents([game(16, 'KC', 'LA'), game(17, 'CAR', 'KC')], 16)
    expect([...labels]).toEqual([
      ['KC', 'vs LAR'],
      ['LAR', '@ KC']
    ])
    expect(streamRows(ctxOf(WAIVER_LEAGUE), 16, labels)[0].opponent).toBe('vs LAR')
  })

  it('rejects a week outside the picker', () => {
    const ctx = ctxOf(WAIVER_LEAGUE)
    expect(() => streamRows(ctx, 18, new Map())).toThrow('Streaming covers weeks 16–17')
    expect(() => streamRows(ctx, 15, new Map())).toThrow('Streaming covers weeks 16–17')
  })
})
