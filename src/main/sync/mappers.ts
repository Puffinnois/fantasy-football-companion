import type { LeagueRecord } from '@main/db/repos/leagues'
import type { PlayerRecord } from '@main/db/repos/players'
import type { RosterPlayerRecord } from '@main/db/repos/teams'
import type {
  SleeperLeague,
  SleeperLeagueUser,
  SleeperNflState,
  SleeperPlayer,
  SleeperRoster
} from '@main/sources/sleeper-types'
import type { LeagueSummary, NflState, Team } from '@shared/types'

const EMPTY_STARTER_SLOT = '0'

export function mapNflState(s: SleeperNflState, fetchedAt: string): NflState {
  return {
    season: s.season,
    week: s.week,
    displayWeek: s.display_week,
    seasonType: s.season_type,
    fetchedAt
  }
}

export function mapLeagueSummary(l: SleeperLeague): LeagueSummary {
  return {
    leagueId: l.league_id,
    name: l.name,
    season: l.season,
    status: l.status,
    totalRosters: l.total_rosters
  }
}

export function mapLeague(l: SleeperLeague, syncedAt: string): LeagueRecord {
  return { ...mapLeagueSummary(l), syncedAt, sleeperRaw: JSON.stringify(l) }
}

export function mapTeams(
  leagueId: string,
  rosters: SleeperRoster[],
  users: SleeperLeagueUser[],
  myUserId: string | null
): Team[] {
  const usersById = new Map(users.map((u) => [u.user_id, u]))
  return rosters.map((r) => {
    const owner = r.owner_id ? usersById.get(r.owner_id) : undefined
    const s = r.settings ?? {}
    return {
      leagueId,
      rosterId: r.roster_id,
      ownerId: r.owner_id,
      displayName: owner?.display_name ?? `Roster ${r.roster_id}`,
      teamName: owner?.metadata?.team_name ?? null,
      avatar: owner?.avatar ?? null,
      wins: s.wins ?? 0,
      losses: s.losses ?? 0,
      ties: s.ties ?? 0,
      fpts: (s.fpts ?? 0) + (s.fpts_decimal ?? 0) / 100,
      fptsAgainst: (s.fpts_against ?? 0) + (s.fpts_against_decimal ?? 0) / 100,
      isMe: myUserId !== null && r.owner_id === myUserId
    }
  })
}

export function mapRosterPlayers(rosters: SleeperRoster[]): RosterPlayerRecord[] {
  const out: RosterPlayerRecord[] = []
  for (const r of rosters) {
    const starters = (r.starters ?? []).filter((id) => id !== EMPTY_STARTER_SLOT)
    const starterSet = new Set(starters)
    const reserve = new Set(r.reserve ?? [])
    const taxi = new Set(r.taxi ?? [])
    starters.forEach((playerId, starterIndex) => {
      out.push({ rosterId: r.roster_id, playerId, slot: 'starter', starterIndex })
    })
    for (const playerId of r.players ?? []) {
      if (starterSet.has(playerId)) continue
      const slot = reserve.has(playerId) ? 'ir' : taxi.has(playerId) ? 'taxi' : 'bench'
      out.push({ rosterId: r.roster_id, playerId, slot, starterIndex: null })
    }
  }
  return out
}

function blankToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

export function mapPlayers(players: Record<string, SleeperPlayer>): PlayerRecord[] {
  const out: PlayerRecord[] = []
  for (const [playerId, p] of Object.entries(players)) {
    const composed = [p.first_name, p.last_name].filter(Boolean).join(' ')
    const fullName = p.full_name || composed || playerId
    out.push({
      playerId,
      fullName,
      firstName: p.first_name ?? null,
      lastName: p.last_name ?? null,
      position: p.position ?? null,
      fantasyPositions: p.fantasy_positions ?? null,
      team: p.team ?? null,
      status: p.status ?? null,
      injuryStatus: p.injury_status ?? null,
      age: p.age ?? null,
      yearsExp: p.years_exp ?? null,
      depthChartOrder: p.depth_chart_order ?? null,
      searchRank: p.search_rank ?? null,
      gsisId: blankToNull(p.gsis_id),
      sportradarId: blankToNull(p.sportradar_id),
      espnId: p.espn_id === null || p.espn_id === undefined ? null : String(p.espn_id)
    })
  }
  return out
}
