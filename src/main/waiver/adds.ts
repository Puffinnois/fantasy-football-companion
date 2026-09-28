import type { LineupBuild } from '@main/lineup/build'
import { myTeam } from '@main/trade/evaluate'
import type { LeagueSettings } from '@shared/rules'
import type { WaiverAdds } from '@shared/types'
import { lineupRows, scoreFreeAgents, waiverContext } from './search'
import { stashRows } from './stash'

export interface WaiverExtras {
  settings: Pick<LeagueSettings, 'waiverType' | 'irSlots' | 'irStatuses'>
  /** Sleeper trending adds by player id (latest fetch). */
  trending: Map<string, number>
  trendingFetchedAt: string | null
}

/** Slice 6c spec §2–3 / §6: the Waivers screen's rest-of-season lists. */
export function waiverAdds(build: LineupBuild, extras: WaiverExtras): WaiverAdds {
  const ctx = waiverContext(build, extras.settings)
  const scored = scoreFreeAgents(ctx)
  const { season, currentWeek, lastWeek } = build.inputs.value.context
  return {
    season,
    currentWeek,
    lastWeek,
    weeks: ctx.weeks.length,
    lineup: lineupRows(ctx, scored),
    stash: stashRows(ctx, scored, extras.trending),
    waiverType: extras.settings.waiverType,
    myWaiverPosition: myTeam(build).waiverPosition,
    teamCount: build.inputs.teams.length,
    trendingFetchedAt: extras.trendingFetchedAt
  }
}
