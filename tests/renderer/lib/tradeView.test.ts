import { describe, expect, it } from 'vitest'
import {
  DEADLINE_NOTE,
  STANCE_OPTIONS,
  acceptanceTags,
  deltaLine,
  focusMarketLine,
  meLine,
  noOffersHint,
  offerLine,
  sideNames,
  stanceHint,
  themLine,
  deltaTone,
  dropLine,
  fmtMarket,
  groupByPosition,
  marketLine,
  playerOption,
  playerStats,
  rangeLine,
  startsLabel,
  verdictBadges,
  windowLabel
} from '@/lib/tradeView'
import {
  barkley,
  chase,
  cook,
  jefferson,
  lar,
  tradeEvaluation,
  tradeSide,
  tradeSuggestion
} from '../../fixtures/trade'

const tradePlayerX = { ...barkley, playerId: 'x', position: null }

describe('tradeView', () => {
  it('labels the window', () => {
    expect(windowLabel({ currentWeek: 3, lastWeek: 17, weeks: 15 })).toBe('weeks 3–17 · 15 weeks')
    expect(windowLabel({ currentWeek: 17, lastWeek: 17, weeks: 1 })).toBe('week 17 · 1 week')
    expect(DEADLINE_NOTE).toContain('deadline')
  })

  it('formats market values with thin thousands and the ratio', () => {
    expect(fmtMarket(10512)).toBe('10 512')
    expect(fmtMarket(0)).toBe('0')
    expect(marketLine(tradeSide())).toBe('gives 10 512 → gets 8 000 (76 %)')
    expect(marketLine(tradeSide({ marketGive: 10512, marketGet: 8000, unvaluedGive: 1 }))).toBe(
      'gives 10 512 → gets 8 000 (76 %) · 1 unvalued'
    )
    expect(marketLine(tradeSide({ marketGive: 0, marketGet: 8000 }))).toBe(
      'gives 0 → gets 8 000 (∞)'
    )
    expect(
      marketLine(tradeSide({ marketGive: 0, marketGet: 0, unvaluedGive: 1, unvaluedGet: 1 }))
    ).toBe('gives 0 → gets 0 (—) · 2 unvalued')
  })

  it('formats the strength lines', () => {
    expect(deltaLine(tradeSide())).toBe('-19.00 (-1.27/wk)')
    expect(deltaLine(tradeSide({ delta: 19, deltaPerWeek: 1.27 }))).toBe('+19.00 (+1.27/wk)')
    expect(rangeLine(tradeSide())).toBe('66.00 → 47.00 · this week -4.00 · 2 weeks change')
    expect(rangeLine(tradeSide({ weeksChanged: 1, thisWeekDelta: 0 }))).toBe(
      '66.00 → 47.00 · this week 0.00 · 1 week changes'
    )
    expect(deltaTone(19)).toBe('green')
    expect(deltaTone(-0.5)).toBe('red')
    expect(deltaTone(0)).toBe('muted')
    expect(dropLine(tradeSide())).toBeNull()
    expect(dropLine(tradeSide({ drops: [lar, cook] }))).toBe('drop: Los Angeles Rams, James Cook')
  })

  it('describes a player row and a picker option', () => {
    expect(startsLabel(barkley, 15)).toBe('starts 15/15')
    expect(playerStats(barkley, 15)).toBe('ROS 118.4 · ECR 1 · MKT 9 340 · starts 15/15')
    expect(playerStats(cook, 15)).toBe('ROS — · ECR — · MKT — · starts 0/15')
    expect(playerOption(jefferson)).toBe('Justin Jefferson · MIN · ROS 128.0')
    expect(playerOption(cook)).toBe('James Cook · BUF · IR · ROS —')
  })

  it('groups pickers by lineup position, others last', () => {
    const groups = groupByPosition([lar, chase, barkley, tradePlayerX])
    expect(groups.map(([pos, players]) => [pos, players.map((p) => p.playerId)])).toEqual([
      ['RB', ['4866']],
      ['WR', ['7564']],
      ['DEF', ['LAR']],
      ['—', ['x']]
    ])
  })

  it('lists the verdict badges', () => {
    expect(verdictBadges(tradeEvaluation())).toEqual([
      { label: 'Win-win', on: false },
      { label: 'Market-fair', on: false }
    ])
    expect(verdictBadges(tradeEvaluation({ winWin: true, marketFair: true }))).toEqual([
      { label: 'Win-win', on: true },
      { label: 'Market-fair', on: true }
    ])
  })

  it('describes a suggestion row', () => {
    const s = tradeSuggestion()
    expect(meLine(s)).toBe('Me +4.00 (+0.27/wk)')
    expect(themLine(s)).toBe('Them -4.00')
    expect(acceptanceTags(s)).toEqual(['market'])
    expect(acceptanceTags(tradeSuggestion({ acceptance: 'both' }))).toEqual(['lineup', 'market'])
    expect(offerLine(s)).toBe("give RB Saquon Barkley · get WR Ja'Marr Chase")
    const withDrop = tradeSuggestion({
      evaluation: tradeEvaluation({
        me: tradeSide({ give: [barkley, jefferson], get: [chase], drops: [lar] })
      })
    })
    expect(offerLine(withDrop)).toBe(
      "give RB Saquon Barkley, WR Justin Jefferson · get WR Ja'Marr Chase · drop: Los Angeles Rams"
    )
    expect(sideNames([tradePlayerX])).toBe('— Saquon Barkley')
  })

  it('labels the stance controls and the empty result', () => {
    expect(STANCE_OPTIONS.map((o) => o.value)).toEqual(['premium', 'fair', 'overpay'])
    expect(STANCE_OPTIONS.map((o) => o.label)).toEqual(['Premium', 'Fair', 'Overpay'])
    expect(stanceHint('premium')).toBe(
      'I gain ≥ 1 pt/week and get ≥ 100 % of the market value I give'
    )
    expect(stanceHint('fair')).toBe('I gain and get ≥ 85 % of the market value I give')
    expect(stanceHint('overpay')).toBe(
      'I lose ≤ 1 pt/week and get ≥ 70 % of the market value I give'
    )
    expect(noOffersHint('premium')).toBe('No offers at this stance — try fair or overpay')
    expect(noOffersHint('fair')).toBe('No offers at this stance — try overpay')
    expect(noOffersHint('overpay')).toBe('No offers — widen the focus or pick another team')
  })

  it('shows the sell-high check for the focus player', () => {
    expect(focusMarketLine(barkley)).toBe('MKT 9 340 · 30d -310')
    expect(focusMarketLine(jefferson)).toBe('MKT 10 512 · 30d +120')
    expect(focusMarketLine(lar)).toBe('MKT —')
  })
})
