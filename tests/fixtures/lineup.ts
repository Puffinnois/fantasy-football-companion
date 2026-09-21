import type { LineupPlayer, LineupWeek, SlotEntry, TeamLineup, TeamStrength } from '@shared/types'

export function lineupPlayer(over: Partial<LineupPlayer> & { playerId: string }): LineupPlayer {
  return {
    fullName: `Player ${over.playerId}`,
    position: 'RB',
    team: 'PHI',
    statsAvailable: true,
    opponent: 'DAL',
    dvpRank: 12,
    value: 10,
    played: false,
    injuryStatus: null,
    flag: null,
    expert: null,
    floor: 6,
    ceiling: 15,
    ...over
  }
}

export function slotEntry(
  slot: string,
  player: LineupPlayer | null,
  closeCall: LineupPlayer | null = null
): SlotEntry {
  return { slot, player, closeCall }
}

export function teamLineup(over: Partial<TeamLineup> = {}): TeamLineup {
  const rb1 = lineupPlayer({ playerId: 'rb1', fullName: 'Saquon Barkley', value: 18.4 })
  const wr1 = lineupPlayer({
    playerId: 'wr1',
    fullName: 'Justin Jefferson',
    position: 'WR',
    team: 'MIN',
    value: 16.2
  })
  return {
    rosterId: 1,
    name: 'Cook Book',
    isMe: true,
    optimal: [slotEntry('RB', rb1), slotEntry('WR', wr1)],
    optimalTotal: 34.6,
    current: [slotEntry('RB', rb1), slotEntry('WR', wr1)],
    currentTotal: 34.6,
    actualTotal: null,
    bench: [],
    unavailable: [],
    swaps: [],
    ...over
  }
}

export function lineupWeek(over: Partial<LineupWeek> = {}): LineupWeek {
  return {
    season: 2026,
    week: 3,
    currentWeek: 3,
    status: 'upcoming',
    projectionsStored: true,
    matchupId: 1,
    me: teamLineup(),
    opponent: teamLineup({
      rosterId: 2,
      name: 'Rival',
      isMe: false,
      optimalTotal: 30.1,
      currentTotal: 28.7
    }),
    ...over
  }
}

export function teamStrength(over: Partial<TeamStrength> = {}): TeamStrength {
  const rosterId = over.rosterId ?? 1
  return {
    rosterId,
    name: `Team ${rosterId}`,
    isMe: false,
    thisWeek: 120,
    rosTotal: 1800,
    rosPerWeek: 112.5,
    rank: 1,
    ...over
  }
}
