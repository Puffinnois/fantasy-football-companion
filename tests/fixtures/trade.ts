import type { TradeEvaluation, TradePlayer, TradePool, TradeSideResult } from '@shared/types'

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

export function tradeSide(over: Partial<TradeSideResult> = {}): TradeSideResult {
  return {
    rosterId: 1,
    name: 'Cook Book',
    isMe: true,
    give: [jefferson],
    get: [chase],
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

export function tradeEvaluation(over: Partial<TradeEvaluation> = {}): TradeEvaluation {
  return {
    season: 2026,
    currentWeek: 3,
    lastWeek: 17,
    weeks: 15,
    tradeDeadlinePassed: false,
    me: tradeSide(),
    them: tradeSide({
      rosterId: 2,
      name: 'Rival',
      isMe: false,
      give: [chase],
      get: [jefferson],
      before: 9,
      after: 28,
      delta: 19,
      deltaPerWeek: 1.27,
      thisWeekDelta: 4,
      marketGive: 8000,
      marketGet: 10512
    }),
    winWin: false,
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
