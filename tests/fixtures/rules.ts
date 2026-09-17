import type { Rules } from '@shared/rules'

/** A standard 12-team PPR rule set; override any field for a scenario. */
export function rules(overrides: Partial<Rules> = {}): Rules {
  return {
    source: 'sleeper',
    updatedAt: '2026-09-17T12:00:00.000Z',
    scoring: {
      pass_yd: 0.04,
      pass_td: 4,
      pass_int: -1,
      rush_yd: 0.1,
      rush_td: 6,
      rec: 1,
      rec_yd: 0.1,
      rec_td: 6,
      fum_lost: -2
    },
    positionOverrides: {},
    rosterSlots: [
      { slot: 'QB', count: 1 },
      { slot: 'RB', count: 2 },
      { slot: 'WR', count: 2 },
      { slot: 'TE', count: 1 },
      { slot: 'FLEX', count: 1 },
      { slot: 'K', count: 1 },
      { slot: 'DEF', count: 1 },
      { slot: 'BN', count: 6 },
      { slot: 'IR', count: 1 }
    ],
    settings: {
      numTeams: 12,
      waiverType: 'faab',
      faabBudget: 100,
      tradeDeadlineWeek: 13,
      playoffStartWeek: 15,
      playoffTeams: 6
    },
    ...overrides
  }
}
