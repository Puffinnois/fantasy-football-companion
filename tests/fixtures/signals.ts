import type { PlayerSignals, Trend, UsageTrend } from '@shared/types'

export const usageTrend = (season: number, recent: number, trend: Trend): UsageTrend => ({
  season,
  recent,
  trend
})

/** A fully populated PlayerSignals for renderer tests; override what a case needs. */
export function signalsFixture(over: Partial<PlayerSignals> = {}): PlayerSignals {
  return {
    usage: {
      snapPct: usageTrend(0.7, 0.8, 'rising'),
      targetShare: usageTrend(0.22, 0.24, 'flat'),
      rushShare: null,
      airYardsShare: null,
      wopr: usageTrend(0.5, 0.52, 'flat')
    },
    tdDelta: 1.8,
    tdFlag: 'down',
    ypo: 8.2,
    ypoDelta: -0.4,
    vsProjPoints: 12.3,
    vsProjPct: 0.09,
    floor: 6.1,
    ceiling: 17.4,
    stdev: 4.2,
    startRate: 0.63,
    nextOpponent: { team: 'DAL', rank: 12 },
    rosSos: 18.5,
    byesRemaining: 1,
    ...over
  }
}
