/** A move with its source roster — what both the builder and the main process know about a player. */
export interface DealMove {
  playerId: string
  from: number
  to: number
}

/** Multi-team spec §2.1: the teams of a deal in order of first appearance, each move's source first. */
export function dealTeams(moves: DealMove[]): number[] {
  const teams: number[] = []
  for (const m of moves) {
    if (!teams.includes(m.from)) teams.push(m.from)
    if (!teams.includes(m.to)) teams.push(m.to)
  }
  return teams
}

/**
 * Spec §2.1: the first rule a deal breaks, worded for the builder's hint and `INVALID_TRADE`; null
 * when the deal is valid. `teams` is the deal's team list — the builder's, or `dealTeams` in main.
 */
export function dealProblem(
  teams: number[],
  moves: DealMove[],
  me: number,
  teamName: (rosterId: number) => string,
  playerName: (playerId: string) => string
): string | null {
  if (teams.length < 2) return 'Pick at least one other team'
  if (!teams.includes(me)) return 'Your team must be part of the trade'
  const seen = new Set<string>()
  for (const m of moves) {
    if (seen.has(m.playerId)) return 'A player can only move once'
    seen.add(m.playerId)
    if (m.from === m.to) return `${playerName(m.playerId)} is already on ${teamName(m.to)}`
  }
  for (const t of teams) {
    if (!moves.some((m) => m.from === t)) return `${teamName(t)} sends nobody`
    if (!moves.some((m) => m.to === t)) return `${teamName(t)} gets nobody`
  }
  return null
}
