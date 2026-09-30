import type {
  TradeEvaluation,
  TradeIncoming,
  TradeOutgoing,
  TradePlayer,
  TradePool,
  TradeSideResult,
  TradeSuggestion
} from '@shared/types'

export function tradePlayer(over: Partial<TradePlayer> & { playerId: string }): TradePlayer {
  return {
    fullName: `Player ${over.playerId}`,
    position: 'RB',
    team: 'PHI',
    statsAvailable: true,
    injuryStatus: null,
    reserve: null,
    rosPoints: 100,
    rosValue: 20,
    expert: null,
    market: null,
    starterWeeks: 10,
    ...over
  }
}

export const barkley = tradePlayer({
  playerId: '4866',
  fullName: 'Saquon Barkley',
  rosPoints: 118.4,
  starterWeeks: 15,
  expert: { ecrRank: 2, ecrPosRank: 1, spread: 1.1, experts: 40, ecrDelta: 0 },
  market: { value: 9340, posRank: 1, tier: 1, trend30d: -310 }
})
export const jefferson = tradePlayer({
  playerId: '6794',
  fullName: 'Justin Jefferson',
  position: 'WR',
  team: 'MIN',
  rosPoints: 128,
  starterWeeks: 15,
  market: { value: 10512, posRank: 1, tier: 1, trend30d: 120 }
})
export const lar = tradePlayer({
  playerId: 'LAR',
  fullName: 'Los Angeles Rams',
  position: 'DEF',
  team: 'LAR',
  rosPoints: 0,
  rosValue: null,
  starterWeeks: 15
})
export const cook = tradePlayer({
  playerId: '8259',
  fullName: 'James Cook',
  team: 'BUF',
  reserve: 'ir',
  rosPoints: null,
  rosValue: null,
  starterWeeks: 0
})
export const chase = tradePlayer({
  playerId: '7564',
  fullName: "Ja'Marr Chase",
  position: 'WR',
  team: 'CIN',
  rosPoints: 9,
  starterWeeks: 1,
  market: { value: 8000, posRank: 2, tier: 1, trend30d: 40 }
})
export const bijan = tradePlayer({
  playerId: '9509',
  fullName: 'Bijan Robinson',
  team: 'ATL',
  reserve: 'taxi',
  rosPoints: 7,
  starterWeeks: 0
})

export const outgoing = (p: TradePlayer, to: number): TradeOutgoing => ({ ...p, to })
export const incoming = (p: TradePlayer, from: number): TradeIncoming => ({ ...p, from })

export function tradeSide(over: Partial<TradeSideResult> = {}): TradeSideResult {
  return {
    rosterId: 1,
    name: 'Cook Book',
    isMe: true,
    give: [outgoing(jefferson, 2)],
    get: [incoming(chase, 2)],
    drops: [],
    before: 66,
    after: 47,
    delta: -19,
    deltaPerWeek: -1.27,
    thisWeekDelta: -4,
    marketGive: 10512,
    marketGet: 8000,
    unvaluedGive: 0,
    unvaluedGet: 0,
    weeksChanged: 2,
    thisWeekSwaps: [],
    ...over
  }
}

/** Rival's side of Jefferson for Chase. */
export function rivalSide(over: Partial<TradeSideResult> = {}): TradeSideResult {
  return tradeSide({
    rosterId: 2,
    name: 'Rival',
    isMe: false,
    give: [outgoing(chase, 1)],
    get: [incoming(jefferson, 1)],
    before: 9,
    after: 28,
    delta: 19,
    deltaPerWeek: 1.27,
    thisWeekDelta: 4,
    marketGive: 8000,
    marketGet: 10512,
    ...over
  })
}

export function tradeEvaluation(over: Partial<TradeEvaluation> = {}): TradeEvaluation {
  return {
    season: 2026,
    currentWeek: 3,
    lastWeek: 17,
    weeks: 15,
    tradeDeadlinePassed: false,
    sides: [tradeSide(), rivalSide()],
    everyoneGains: false,
    marketFair: false,
    ...over
  }
}

export function tradePool(over: Partial<TradePool> = {}): TradePool {
  return {
    season: 2026,
    currentWeek: 3,
    lastWeek: 17,
    weeks: 15,
    tradeDeadlinePassed: false,
    me: { rosterId: 1, name: 'Cook Book', players: [barkley, cook, jefferson, lar] },
    teams: [{ rosterId: 2, name: 'Rival', players: [bijan, chase] }],
    ...over
  }
}

/** Barkley for Chase: +4 over the window for me, −4 for Rival, who takes it on the market (1.17). */
export function tradeSuggestion(over: Partial<TradeSuggestion> = {}): TradeSuggestion {
  return {
    evaluation: tradeEvaluation({
      sides: [
        tradeSide({
          give: [outgoing(barkley, 2)],
          get: [incoming(chase, 2)],
          before: 66,
          after: 70,
          delta: 4,
          deltaPerWeek: 0.27,
          thisWeekDelta: 1,
          marketGive: 9340,
          marketGet: 8000,
          weeksChanged: 3
        }),
        rivalSide({
          give: [outgoing(chase, 1)],
          get: [incoming(barkley, 1)],
          before: 30,
          after: 26,
          delta: -4,
          deltaPerWeek: -0.27,
          thisWeekDelta: -1,
          marketGive: 8000,
          marketGet: 9340,
          weeksChanged: 3
        })
      ],
      everyoneGains: false,
      marketFair: false // 8 000 / 9 340 = 0.86 on my side
    }),
    acceptance: [null, 'market'],
    ...over
  }
}

export const higgins = tradePlayer({
  playerId: '5859',
  fullName: 'Tee Higgins',
  position: 'WR',
  team: 'CIN',
  rosPoints: 90,
  starterWeeks: 12
})

/** The default pool plus a third team, Tank Mode, holding Higgins. */
export function threeTeamPool(): TradePool {
  return tradePool({
    teams: [
      { rosterId: 2, name: 'Rival', players: [bijan, chase] },
      { rosterId: 3, name: 'Tank Mode', players: [higgins] }
    ]
  })
}

/** Me → Rival → Tank Mode → me: Jefferson to Rival, Chase to Tank Mode, Higgins to me. */
export function threeTeamEvaluation(): TradeEvaluation {
  return tradeEvaluation({
    sides: [
      tradeSide({
        give: [outgoing(jefferson, 2)],
        get: [incoming(higgins, 3)],
        delta: 6,
        deltaPerWeek: 0.4
      }),
      rivalSide({
        give: [outgoing(chase, 3)],
        get: [incoming(jefferson, 1)],
        delta: 3,
        deltaPerWeek: 0.2
      }),
      tradeSide({
        rosterId: 3,
        name: 'Tank Mode',
        isMe: false,
        give: [outgoing(higgins, 1)],
        get: [incoming(chase, 2)],
        delta: -1.5,
        deltaPerWeek: -0.1
      })
    ]
  })
}
