import { round2 } from '@main/db/repos/points'
import type { GameRow } from '@main/db/repos/stats'
import { rosterWeek, type LineupBuild, type TeamWeek } from '@main/lineup/build'
import { tradePlayer } from '@main/trade/player'
import type { PlayerSeries } from '@main/value/series'
import { streamWeeks } from '@shared/rules'
import { toSleeperTeam } from '@shared/teams'
import type { StreamOption, StreamRow } from '@shared/types'
import { applyRelease, compareReleases, type IrSettings, type ReleaseCandidate } from './release'
import {
  canHelp,
  freeAgents,
  releasePlayer,
  releaseSolves,
  waiverContext,
  type SearchOptions,
  type WaiverContext
} from './search'

/** Slice 6c spec §4: a streamer must net at least this much in his week to be listed. */
export const STREAM_MIN_NET = 0.5

export interface StreamExtras {
  settings: IrSettings
  /** Sleeper team → "vs CAR" / "@ CAR" in the target week (`weekOpponents`). */
  opponents: Map<string, string>
}

/** Spec §4: each team's opponent in `week` — "vs X" at home, "@ X" away — in Sleeper codes. */
export function weekOpponents(games: GameRow[], week: number): Map<string, string> {
  const out = new Map<string, string>()
  for (const g of games) {
    if (g.week !== week) continue
    const home = toSleeperTeam(g.homeTeam)
    const away = toSleeperTeam(g.awayTeam)
    out.set(home, `vs ${away}`)
    out.set(away, `@ ${home}`)
  }
  return out
}

/** The context narrowed to window week index `i`: the add solves then cover that week alone. */
function weekContext(ctx: WaiverContext, i: number): WaiverContext {
  const without = new Map<string, TeamWeek[]>()
  for (const [id, weeks] of ctx.without) without.set(id, [weeks[i]])
  return {
    ...ctx,
    weeks: [ctx.weeks[i]],
    base: [ctx.base[i]],
    before: ctx.base[i].optimalTotal,
    without
  }
}

/** Spec §4: what each release costs me over the window's other weeks — the same for every streamer. */
function restCosts(
  ctx: WaiverContext,
  week: number,
  opts: SearchOptions
): Map<ReleaseCandidate, number> {
  const costs = new Map<ReleaseCandidate, number>()
  for (const r of ctx.releases) {
    if (r.series === null) {
      costs.set(r, 0)
      continue
    }
    // The context already holds my lineup without him (unsolved where he doesn't start);
    // the tests' brute force solves every week instead.
    const rest = opts.skip === false ? applyRelease(ctx.roster, r) : null
    const without = ctx.without.get(r.series.base.playerId) ?? []
    let cost = 0
    ctx.weeks.forEach((w, j) => {
      if (w === week) return
      const after = rest ? rosterWeek(ctx.build, rest, w) : without[j]
      cost += ctx.base[j].optimalTotal - after.optimalTotal
    })
    costs.set(r, round2(cost) ?? 0)
  }
  return costs
}

function played(s: PlayerSeries, week: number): boolean {
  return s.weeks.find((w) => w.week === week)?.played ?? false
}

function opponentOf(s: PlayerSeries, week: number, opponents: Map<string, string>): string | null {
  const labelled = s.base.team !== null ? opponents.get(s.base.team) : undefined
  return labelled ?? s.weeks.find((w) => w.week === week)?.opponent ?? null
}

/** Spec §4: one-week pickups for `week`, each release netted against its cost over the rest of the window. */
export function streamRows(
  ctx: WaiverContext,
  week: number,
  opponents: Map<string, string>,
  opts: SearchOptions = {}
): StreamRow[] {
  const { currentWeek, lastWeek } = ctx.build.inputs.value.context
  const allowed = streamWeeks(currentWeek, lastWeek)
  const i = ctx.weeks.indexOf(week)
  if (i < 0 || !allowed.includes(week)) {
    throw new Error(`Streaming covers weeks ${allowed[0]}–${allowed[allowed.length - 1]}`)
  }
  const one = weekContext(ctx, i)
  const costs = restCosts(ctx, week, opts)
  const rows: StreamRow[] = []
  for (const add of freeAgents(ctx.build)) {
    if (played(add, week)) continue
    // Can't enter my week-t lineup: no release raises the week, and every release costs ≥ 0.
    if (opts.skip !== false && !canHelp(one, add)) continue
    const options = releaseSolves(one, add, opts)
      .map(({ r, after }) => {
        const weekGain = round2(after[0].optimalTotal - one.before) ?? 0
        const restCost = costs.get(r) ?? 0
        const option: StreamOption = {
          release: r.release,
          releasePlayer: releasePlayer(ctx, r),
          weekGain,
          restCost,
          net: round2(weekGain - restCost) ?? 0
        }
        return { r, option }
      })
      .sort((a, b) => b.option.net - a.option.net || compareReleases(ctx.build, a.r, b.r))
      .map((x) => x.option)
    if (options[0].net < STREAM_MIN_NET) continue
    rows.push({
      player: tradePlayer(ctx.build, add, 0),
      opponent: opponentOf(add, week, opponents),
      options
    })
  }
  return rows.sort(
    (a, b) =>
      b.options[0].net - a.options[0].net ||
      b.options[0].weekGain - a.options[0].weekGain ||
      a.player.fullName.localeCompare(b.player.fullName)
  )
}

/** Spec §4 / §6: the Waivers screen's streaming list for `week`. */
export function waiverStream(build: LineupBuild, week: number, extras: StreamExtras): StreamRow[] {
  return streamRows(waiverContext(build, extras.settings), week, extras.opponents)
}
