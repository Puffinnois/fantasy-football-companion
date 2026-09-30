import type {
  AddOption,
  AddRow,
  StashRow,
  StreamOption,
  StreamRow,
  WaiverAdds
} from '@shared/types'
import { tradePlayer } from './trade'

export const allgeier = tradePlayer({
  playerId: '7001',
  fullName: 'Tyler Allgeier',
  team: 'ATL',
  starterWeeks: 0
})
export const miller = tradePlayer({
  playerId: '7002',
  fullName: 'Kendre Miller',
  team: 'NO',
  starterWeeks: 0
})
export const wright = tradePlayer({
  playerId: '7004',
  fullName: 'Jaylen Wright',
  team: 'MIA',
  starterWeeks: 0,
  expert: { ecrRank: 120, ecrPosRank: 34, spread: 5, experts: 30, ecrDelta: null },
  market: { value: 2100, posRank: 40, tier: 6, trend30d: 0 }
})
export const harris = tradePlayer({
  playerId: '7005',
  fullName: 'Tre Harris',
  position: 'WR',
  team: 'LAC',
  starterWeeks: 0
})

export function addOption(over: Partial<AddOption> = {}): AddOption {
  return {
    release: { kind: 'drop', playerId: miller.playerId },
    releasePlayer: miller,
    delta: 6,
    deltaPerWeek: 0.4,
    thisWeekDelta: 0,
    startWeeks: [7, 9],
    ...over
  }
}

export function addRow(over: Partial<AddRow> = {}): AddRow {
  return { player: allgeier, options: [addOption()], ...over }
}

export function stashRow(over: Partial<StashRow> = {}): StashRow {
  return {
    player: wright,
    trending: null,
    options: [addOption({ delta: 0, deltaPerWeek: 0, startWeeks: [] })],
    ...over
  }
}

export function waiverAdds(over: Partial<WaiverAdds> = {}): WaiverAdds {
  return {
    season: 2026,
    currentWeek: 3,
    lastWeek: 17,
    weeks: 15,
    lineup: [addRow()],
    stash: [stashRow(), stashRow({ player: harris, trending: 1200 })],
    waiverType: 'priority',
    myWaiverPosition: 12,
    teamCount: 16,
    trendingFetchedAt: null,
    ...over
  }
}

export function streamOption(over: Partial<StreamOption> = {}): StreamOption {
  return {
    release: { kind: 'drop', playerId: miller.playerId },
    releasePlayer: miller,
    weekGain: 6.5,
    restCost: 0,
    net: 6.5,
    ...over
  }
}

/** Tre Harris (WR) at Carolina, dropping Kendre Miller for +6.50. */
export function streamRow(over: Partial<StreamRow> = {}): StreamRow {
  return { player: harris, opponent: '@ CAR', options: [streamOption()], ...over }
}
