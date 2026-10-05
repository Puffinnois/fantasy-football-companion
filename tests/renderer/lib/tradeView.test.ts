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
  openSpotLine,
  sideNames,
  spotFor,
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
  verdictGetsLine,
  windowLabel,
  queryOf,
  controlsOf,
  sameQuery,
  teamCountOptions,
  fmtElapsed,
  suggestStatusLine,
  teamsChip,
  pathLine,
  otherSideLine,
  otherWaysLabel,
  alternativeLine,
  DEFAULT_CONTROLS,
  pruneControls
} from '@/lib/tradeView'
import {
  barkley,
  bijan,
  chase,
  cook,
  incoming,
  jefferson,
  lar,
  outgoing,
  rivalSide,
  threeTeamEvaluation,
  tradeEvaluation,
  tradePool,
  tradeSide,
  tradeSuggestion,
  threeTeamSuggestion
} from '../../fixtures/trade'
import type { SuggestSnapshot } from '@shared/types'

const tradePlayerX = { ...barkley, playerId: 'x', position: null }

describe('tradeView', () => {
  it('describes an open spot', () => {
    expect(openSpotLine({ rosterId: 1, add: bijan, deltaPerWeek: 0.8 })).toBe(
      `Open spot: best add ${bijan.fullName}, +0.80/wk`
    )
    expect(openSpotLine({ rosterId: 2, add: null, deltaPerWeek: 0 })).toBe(
      'Open spot: no free agent improves this lineup'
    )
  })

  it('finds a side’s open spot by roster, whatever the order', () => {
    const spots = {
      sides: [
        null,
        { rosterId: 3, add: bijan, deltaPerWeek: 0.5 },
        { rosterId: 1, add: null, deltaPerWeek: 0 }
      ]
    }
    expect(spotFor(spots, 1)).toEqual({ rosterId: 1, add: null, deltaPerWeek: 0 })
    expect(spotFor(spots, 3)?.add).toBe(bijan)
    expect(spotFor(spots, 2)).toBeNull()
    expect(spotFor(null, 1)).toBeNull()
  })

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
      { label: 'Everyone gains', on: false },
      { label: 'Market-fair', on: false }
    ])
    expect(verdictBadges(tradeEvaluation({ everyoneGains: true, marketFair: true }))).toEqual([
      { label: 'Everyone gains', on: true },
      { label: 'Market-fair', on: true }
    ])
  })

  it('describes a suggestion row', () => {
    const s = tradeSuggestion()
    expect(meLine(s)).toBe('Me +4.00 (+0.27/wk)')
    expect(themLine(s)).toBe('Them -4.00')
    expect(acceptanceTags(s)).toEqual(['market'])
    expect(acceptanceTags(tradeSuggestion({ acceptance: [null, 'both'] }))).toEqual([
      'lineup',
      'market'
    ])
    expect(offerLine(s)).toBe("give RB Saquon Barkley · get WR Ja'Marr Chase")
    const withDrop = tradeSuggestion({
      evaluation: tradeEvaluation({
        sides: [
          tradeSide({
            give: [outgoing(barkley, 2), outgoing(jefferson, 2)],
            get: [incoming(chase, 2)],
            drops: [lar]
          }),
          rivalSide()
        ]
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

  it('names where each received player comes from', () => {
    const ev = threeTeamEvaluation()
    expect(ev.sides.map((s) => verdictGetsLine(s, ev))).toEqual([
      'gets Tee Higgins from Tank Mode',
      'gets Justin Jefferson from me',
      "gets Ja'Marr Chase from Rival"
    ])
  })
})

describe('suggestion controls (multi-team spec §5.2)', () => {
  it('forgets a focus player or team that is gone and caps Up to at the league size', () => {
    // tradePool(): me holds Barkley (4866); one other team, Rival (2)
    const gone = {
      ...DEFAULT_CONTROLS,
      focusKind: 'give' as const,
      focusGive: 'gone',
      maxTeams: 4,
      mustInclude: 9
    }
    expect(pruneControls(gone, tradePool())).toEqual({
      ...gone,
      focusGive: '',
      maxTeams: 2,
      mustInclude: null
    })
    const kept = { ...gone, focusGive: '4866', maxTeams: 2, mustInclude: 2 }
    expect(pruneControls(kept, tradePool())).toEqual(kept)
  })

  it('turns controls into a query and back', () => {
    expect(queryOf(DEFAULT_CONTROLS, 2026)).toEqual({
      season: 2026,
      focus: null,
      stance: 'fair',
      maxTeams: 3,
      mustInclude: null
    })
    const give = { ...DEFAULT_CONTROLS, focusKind: 'give' as const, focusGive: '4866' }
    expect(queryOf(give, 2026).focus).toEqual({ give: '4866' })
    // "I give" with nobody picked yet is no focus
    expect(queryOf({ ...give, focusGive: '' }, 2026).focus).toBeNull()
    const want = { ...DEFAULT_CONTROLS, focusKind: 'want' as const, focusWant: 'WR' }
    expect(queryOf(want, 2026).focus).toEqual({ want: 'WR' })
    for (const c of [
      DEFAULT_CONTROLS,
      give,
      want,
      { ...DEFAULT_CONTROLS, maxTeams: 4, mustInclude: 7 }
    ]) {
      expect(queryOf(controlsOf(queryOf(c, 2026)), 2026)).toEqual(queryOf(c, 2026))
    }
  })

  it('compares queries and lists the team counts', () => {
    const q = queryOf(DEFAULT_CONTROLS, 2026)
    expect(sameQuery(q, { ...q })).toBe(true)
    expect(sameQuery(q, { ...q, focus: { give: '1' } })).toBe(false)
    expect(sameQuery(q, { ...q, maxTeams: 4 })).toBe(false)
    expect(sameQuery(q, { ...q, mustInclude: 2 })).toBe(false)
    expect(sameQuery(q, { ...q, stance: 'premium' })).toBe(false)
    expect(teamCountOptions(2)).toEqual([2])
    expect(teamCountOptions(5)).toEqual([2, 3, 4, 5])
  })
})

describe('suggestion status line (multi-team spec §5.2)', () => {
  const snap = (over: Partial<SuggestSnapshot>): SuggestSnapshot => ({
    runId: 1,
    query: queryOf(DEFAULT_CONTROLS, 2026),
    cards: [],
    progress: { checked: 412, total: 18900, found: 12, size: 3, elapsedMs: 37_400 },
    status: 'running',
    message: null,
    ...over
  })
  const twelve = Array.from({ length: 12 }, () => tradeSuggestion())

  it('reads each state', () => {
    expect(fmtElapsed(0)).toBe('0:00')
    expect(fmtElapsed(37_400)).toBe('0:37')
    expect(fmtElapsed(725_000)).toBe('12:05')
    expect(suggestStatusLine(snap({ cards: twelve }))).toBe(
      'Searching 3-team deals · 412 of 18 900 ideas checked · 12 found · 0:37'
    )
    expect(suggestStatusLine(snap({ status: 'full', cards: twelve }))).toBe(
      'Done: best 12 found — nothing left could rank higher'
    )
    expect(suggestStatusLine(snap({ status: 'complete', cards: twelve }))).toBe(
      'Done: 12 found, every idea checked'
    )
    expect(suggestStatusLine(snap({ status: 'complete' }))).toBe(
      'No offers at this stance — try overpay'
    )
    expect(suggestStatusLine(snap({ status: 'stopped', cards: twelve }))).toBe(
      'Stopped: 12 found so far'
    )
    expect(suggestStatusLine(snap({ status: 'stale' }))).toBe('League data changed — run again')
    // an errored run that went stale keeps its error
    expect(suggestStatusLine(snap({ status: 'stale', message: 'boom' }))).toBe(
      'Search failed: boom · League data changed — run again'
    )
    expect(suggestStatusLine(snap({ status: 'error', message: 'boom' }))).toBe(
      'Search failed: boom'
    )
  })
})

describe('suggestion rows (multi-team spec §5.2)', () => {
  it('shows a 3-team card as a path with every other team', () => {
    const s = threeTeamSuggestion()
    expect(teamsChip(s)).toBe('3-team')
    expect(teamsChip(tradeSuggestion())).toBe('2-team')
    expect(pathLine(s)).toBe(
      "I send WR Justin Jefferson → Rival · Rival sends WR Ja'Marr Chase → Tank Mode · Tank Mode sends WR Tee Higgins → me"
    )
    expect(s.evaluation.sides.slice(1).map(otherSideLine)).toEqual([
      'Rival +0.20/wk',
      'Tank Mode -0.10/wk'
    ])
    expect(acceptanceTags(s, 1)).toEqual(['lineup'])
    expect(acceptanceTags(s, 2)).toEqual(['market'])
    expect(acceptanceTags(tradeSuggestion())).toEqual(['market'])
  })

  it('labels the other ways', () => {
    expect(otherWaysLabel(1)).toBe('+1 other way')
    expect(otherWaysLabel(3)).toBe('+3 other ways')
    expect(alternativeLine(threeTeamSuggestion().alternatives[0])).toBe(
      'via Rival: Bijan Robinson · worst side -0.30/wk'
    )
  })
})
