import { describe, expect, it } from 'vitest'
import { BOARDS, boardQuery, boardView } from '@/lib/stats/boards'
import type { StatsOwnership } from '@shared/stats/types'
import { result, row, STATUS, value } from '../../fixtures/statsScreens'

const COUNT = { unit: 'count' as const, decimals: 0, kind: 'count' as const }
const scope = { season: 2026, seasonType: 'REG' as const, weeks: null, scoring: 'half' as const }

describe('the Stats home boards (handoff 4d)', () => {
  it('has the eight boards of the handoff', () => {
    expect(BOARDS.map((b) => `${b.label} ${b.title}`)).toEqual([
      'QB Passing yards',
      'QB Yards per attempt',
      'RB Rushing yards',
      'RB Touches',
      'WR Receiving yards',
      'WR Target share',
      'TE Receiving yards',
      'DEF Takeaways'
    ])
  })

  it('asks for every qualified row of the position, per game when asked', () => {
    expect(boardQuery(BOARDS[4], scope, STATUS, true)).toEqual({
      entity: 'player',
      metrics: ['rec_yds'],
      scope: { seasons: [2026], seasonType: 'REG', positions: ['WR'], qualifiedOnly: true },
      transform: 'perGame',
      scoring: 'half',
      limit: 1000
    })
    expect(boardQuery(BOARDS[7], { ...scope, weeks: [1, 4] }, STATUS, false)).toMatchObject({
      entity: 'team',
      metrics: ['def_turnovers'],
      scope: { seasons: [2026], seasonType: 'REG', weeks: [1, 4], qualifiedOnly: true },
      transform: 'raw'
    })
  })

  it('shows the top six with bars against the leader, and my best one below them', () => {
    const rows = [700, 600, 550, 500, 450, 300, 250, 200, null].map((v, i) =>
      row(`p${i}`, `Player ${i}`, { rec_yds: value(v) }, { games: i === 5 ? 2 : 6 })
    )
    const ownership: StatsOwnership = {
      players: { p7: { name: 'Cook Book', mine: true }, p1: { name: 'Rival', mine: false } },
      teams: {}
    }
    const view = boardView(result(['rec_yds'], rows), COUNT, false, 3, ownership, true)
    // Player 5 played two games: below the three the range needs.
    expect(view.rows.map((r) => `${r.rank} ${r.name} ${r.value} ${r.fraction.toFixed(2)}`)).toEqual(
      [
        '1 Player 0 700 1.00',
        '2 Player 1 600 0.86',
        '3 Player 2 550 0.79',
        '4 Player 3 500 0.71',
        '5 Player 4 450 0.64',
        '6 Player 6 250 0.36'
      ]
    )
    expect(view.rows[0].lead).toBe(true)
    expect(view.rows.some((r) => r.mine)).toBe(false)
    expect(view.extra).toMatchObject({ rank: 7, name: 'Player 7', mine: true })
    expect(view.sub).toBe('total')
    expect(view.qualified).toBe(7)
    expect(boardView(result(['rec_yds'], rows), COUNT, false, 3, ownership, false).extra).toBeNull()
  })

  it('marks my team defense on the takeaways board', () => {
    const rows = [row('DEN', 'DEN', { def_turnovers: value(10) }, { position: null })]
    const view = boardView(
      result(['def_turnovers'], rows),
      COUNT,
      true,
      1,
      { players: {}, teams: { DEN: { name: 'Cook Book', mine: true } } },
      true
    )
    expect(view.rows[0]).toMatchObject({ name: 'DEN', value: '10.0', mine: true })
    expect(view.sub).toBe('per game')
  })
})
