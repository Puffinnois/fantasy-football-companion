import type { Db } from '@main/db/connection'
import { leagueOwnership, playerLink } from '@main/db/repos/ownership'
import { getRules } from '@main/db/repos/rules'
import { listRoster, listTeams } from '@main/db/repos/teams'
import { scoringFormat, type Rules } from '@shared/rules'
import type { StatsOwnership } from '@shared/stats/types'

/**
 * The imported league, read only (Ask spec §1 "Reach"): rosters, who rosters whom and the league's
 * scoring. The `league` tool and the `rostered` filter read it; nothing writes.
 */
export interface LeagueTeam {
  rosterId: number
  name: string
  mine: boolean
}

export interface LeagueRosterEntry {
  name: string
  position: string | null
  /** The NFL team, as Sleeper lists it. */
  team: string | null
  slot: string
  /** Its gsis id, when the stats know the player. */
  gsis: string | null
}

export interface LeagueReader {
  teams(): LeagueTeam[]
  roster(rosterId: number): LeagueRosterEntry[]
  ownership(): StatsOwnership
  rules(): Rules | null
}

export function companionLeague(db: Db, leagueId: string): LeagueReader {
  return {
    teams: () =>
      listTeams(db, leagueId).map((t) => ({
        rosterId: t.rosterId,
        name: t.teamName ?? t.displayName,
        mine: t.isMe
      })),
    roster: (rosterId) =>
      listRoster(db, leagueId, rosterId).map((p) => ({
        name: p.fullName,
        position: p.position,
        team: p.team,
        slot: p.slot,
        gsis: playerLink(db, { sleeper: p.playerId })?.gsis ?? null
      })),
    ownership: () => leagueOwnership(db, leagueId),
    rules: () => getRules(db, leagueId)
  }
}

/** The league's scoring in a few lines a model can quote. */
export function scoringSummary(rules: Rules): string[] {
  const s = rules.scoring as Record<string, number | undefined>
  const per = (key: string, unit: number): string | null =>
    s[key] ? `${Math.round(s[key]! * unit * 100) / 100} per ${unit} ` : null
  const lines = [
    `Format: ${scoringFormat(rules)} (${s.rec ?? 0} per reception)`,
    `Passing: ${per('pass_yd', 25) ?? '0 '}yards, ${s.pass_td ?? 0} per TD, ${s.pass_int ?? 0} per interception`,
    `Rushing: ${per('rush_yd', 10) ?? '0 '}yards, ${s.rush_td ?? 0} per TD`,
    `Receiving: ${per('rec_yd', 10) ?? '0 '}yards, ${s.rec_td ?? 0} per TD`,
    `Fumbles lost: ${s.fum_lost ?? 0}`
  ]
  for (const [position, over] of Object.entries(rules.positionOverrides)) {
    const rec = (over as Record<string, number> | undefined)?.rec
    if (rec !== undefined) lines.push(`${position} premium: ${rec} per reception`)
  }
  return lines
}
