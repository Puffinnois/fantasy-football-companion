import { describe, expect, it } from 'vitest'
import { TradeError, type TradeErrorCode } from '@main/trade/evaluate'
import type { PlayerSeries } from '@main/value/series'
import type { IrSettings } from '@main/waiver/release'
import {
  canHelp,
  lineupRows,
  scoreAdd,
  scoreFreeAgents,
  waiverContext,
  type WaiverContext
} from '@main/waiver/search'
import type { AddOption } from '@shared/types'
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
function fa(ctx: WaiverContext, id: string): PlayerSeries {
  const s = ctx.build.inputs.value.series.get(id)
  if (!s) throw new Error(`no player ${id}`)
  return s
}
const summary = (options: AddOption[]): [string, number][] =>
  options.map((o) => [
    o.release.kind === 'open' ? 'open' : `${o.release.kind} ${o.release.playerId}`,
    o.delta
  ])
function codeOf(fn: () => unknown): TradeErrorCode | 'no error' {
  try {
    fn()
  } catch (err) {
    if (err instanceof TradeError) return err.code
    throw err
  }
  return 'no error'
}

describe('waiver add search (slice 6c spec §2.3–2.4)', () => {
  it('scores every release for an add, best first, ties to the least upside', () => {
    const ctx = ctxOf(WAIVER_LEAGUE)
    const options = scoreAdd(ctx, fa(ctx, 'X'))
    expect(summary(options)).toEqual([
      ['drop D', 2],
      ['drop B', 2],
      ['drop C', -2],
      ['drop A', -18]
    ])
    expect(options[0]).toMatchObject({ deltaPerWeek: 1, thisWeekDelta: 1, startWeeks: [16, 17] })
    expect(options[0].releasePlayer).toMatchObject({ playerId: 'D', starterWeeks: 0 })
    expect(options[3].releasePlayer).toMatchObject({ playerId: 'A', starterWeeks: 2 })
  })

  it('re-solves only the weeks a released starter plays, and counts the add only where he starts', () => {
    const ctx = ctxOf(WAIVER_LEAGUE)
    const options = scoreAdd(ctx, fa(ctx, 'Y'))
    expect(summary(options)).toEqual([
      ['drop D', 13],
      ['drop C', 6],
      ['drop B', 3],
      ['drop A', -10]
    ])
    expect(options.map((o) => o.thisWeekDelta)).toEqual([0, -7, -5, -15])
    expect(options[0]).toMatchObject({ deltaPerWeek: 6.5, startWeeks: [17] })
  })

  it('skips free agents who cannot start for me in any window week', () => {
    const ctx = ctxOf(WAIVER_LEAGUE)
    expect(['X', 'Y', 'Z', 'K', 'W', 'Q'].filter((id) => canHelp(ctx, fa(ctx, id)))).toEqual([
      'X',
      'Y'
    ])
    expect(
      scoreFreeAgents(ctx)
        .map((x) => x.series.base.playerId)
        .sort()
    ).toEqual(['X', 'Y'])
  })

  it('lists adds worth at least 0.5 over the window, best first, capped', () => {
    const ctx = ctxOf(WAIVER_LEAGUE)
    const scored = scoreFreeAgents(ctx)
    const rows = lineupRows(ctx, scored)
    expect(rows.map((r) => r.player.playerId)).toEqual(['Y', 'X'])
    expect(rows[0].player).toMatchObject({ fullName: 'Y', starterWeeks: 0 })
    expect(lineupRows(ctx, scored, 1).map((r) => r.player.playerId)).toEqual(['Y'])
  })

  it('offers only the open spot when my roster has room', () => {
    const ctx = ctxOf(waiverLeagueWith([A, C, B]))
    expect(summary(scoreAdd(ctx, fa(ctx, 'X')))).toEqual([['open', 2]])
    expect(summary(scoreAdd(ctx, fa(ctx, 'Y')))).toEqual([['open', 13]])
  })

  it('puts an IR move ahead of dropping the same injured player', () => {
    const league = waiverLeagueWith([
      A,
      C,
      B,
      { id: 'D', position: 'WR', weekly: 5, market: 300, injuryStatus: 'Out' }
    ])
    const ctx = ctxOf(league, { irSlots: 1, irStatuses: ['IR', 'Out'] })
    expect(summary(scoreAdd(ctx, fa(ctx, 'X')))).toEqual([
      ['ir D', 2],
      ['drop D', 2],
      ['drop B', 2],
      ['drop C', -2],
      ['drop A', -18]
    ])
  })

  it('throws the engine errors without projections or without my team', () => {
    const blind = syntheticBuild({ ...WAIVER_LEAGUE, weeks: [] }).build
    expect(codeOf(() => waiverContext(blind, {}))).toBe('NO_PROJECTIONS')
    const anonymous = syntheticBuild({
      ...WAIVER_LEAGUE,
      teams: WAIVER_LEAGUE.teams.map((t) => ({ ...t, isMe: false }))
    }).build
    expect(codeOf(() => waiverContext(anonymous, {}))).toBe('NO_ME')
  })
})
