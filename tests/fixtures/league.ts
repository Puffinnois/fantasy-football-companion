import type { Team } from '@shared/types'

export function team(over: Partial<Team> = {}): Team {
  const rosterId = over.rosterId ?? 1
  return {
    leagueId: 'L1',
    rosterId,
    ownerId: `u${rosterId}`,
    displayName: `owner${rosterId}`,
    teamName: `Team ${rosterId}`,
    avatar: null,
    wins: 0,
    losses: 0,
    ties: 0,
    fpts: 0,
    fptsAgainst: 0,
    isMe: false,
    ...over
  }
}
