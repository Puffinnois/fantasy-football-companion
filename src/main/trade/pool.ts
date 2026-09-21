import { teamName, type LineupBuild } from '@main/lineup/build'
import { LINEUP_POSITIONS } from '@shared/rules'
import type { Team, TradePlayer, TradePool, TradePoolTeam } from '@shared/types'
import { myTeam, requireWindow } from './evaluate'
import { starterWeeks, tradePlayer } from './player'

function positionOrder(position: string | null): number {
  const i = position === null ? -1 : LINEUP_POSITIONS.indexOf(position)
  return i === -1 ? LINEUP_POSITIONS.length : i
}

function byPositionThenRos(a: TradePlayer, b: TradePlayer): number {
  return (
    positionOrder(a.position) - positionOrder(b.position) ||
    (b.rosPoints ?? Number.NEGATIVE_INFINITY) - (a.rosPoints ?? Number.NEGATIVE_INFINITY) ||
    a.fullName.localeCompare(b.fullName)
  )
}

/** Spec 6b §4.1: my roster and every other team's, as the builder's pickers show them. */
export function tradePool(build: LineupBuild): TradePool {
  const weeks = requireWindow(build)
  const me = myTeam(build)
  const rows = (t: Team): TradePoolTeam => {
    const starts = starterWeeks(build, t.rosterId, weeks)
    const players = (build.rosters.get(t.rosterId) ?? []).map((s) =>
      tradePlayer(build, s, starts.get(s.base.playerId) ?? 0)
    )
    players.sort(byPositionThenRos)
    return { rosterId: t.rosterId, name: teamName(t), players }
  }
  const { season, currentWeek, lastWeek } = build.inputs.value.context
  const deadline = build.inputs.tradeDeadlineWeek
  return {
    season,
    currentWeek,
    lastWeek,
    weeks: weeks.length,
    tradeDeadlinePassed: deadline !== null && currentWeek > deadline,
    me: rows(me),
    teams: build.inputs.teams
      .filter((t) => t.rosterId !== me.rosterId)
      .sort((a, b) => teamName(a).localeCompare(teamName(b)))
      .map(rows)
  }
}
