/**
 * The data sources the Setup screen lists (design handoff "Setup"): each groups the `sync_log`
 * sources that start with one of its prefixes.
 */
export interface SyncSourceGroup {
  key: string
  label: string
  what: string
  prefixes: string[]
}

export const SYNC_SOURCE_GROUPS: SyncSourceGroup[] = [
  {
    key: 'league',
    label: 'Sleeper league',
    what: 'Rosters, matchups and league settings',
    prefixes: ['sleeper:league', 'sleeper:rules', 'sleeper:matchups:']
  },
  {
    key: 'players',
    label: 'Sleeper players',
    what: 'Names, teams and injury status',
    prefixes: ['sleeper:players', 'sleeper:trending:']
  },
  {
    key: 'projections',
    label: 'Projections',
    what: 'Weekly Sleeper projections',
    prefixes: ['sleeper:projections:']
  },
  {
    key: 'stats',
    label: 'Box scores',
    what: 'Sleeper stat lines and nflverse weekly stats',
    prefixes: ['sleeper:stats:', 'nflverse:']
  },
  {
    key: 'experts',
    label: 'Expert ranks',
    what: 'FantasyPros consensus rankings',
    prefixes: ['fantasypros:']
  },
  {
    key: 'market',
    label: 'Trade values',
    what: 'FantasyCalc market values',
    prefixes: ['fantasycalc:']
  },
  {
    key: 'points',
    label: 'Your points',
    what: 'Every stat scored under your rules',
    prefixes: ['app:points']
  }
]

/** The group a `sync_log` source belongs to; null for sources the list doesn't show (warehouse, identity). */
export function syncGroupOf(source: string): string | null {
  return SYNC_SOURCE_GROUPS.find((g) => g.prefixes.some((p) => source.startsWith(p)))?.key ?? null
}
