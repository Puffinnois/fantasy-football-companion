import initial from './001_initial.sql?raw'
import rulesSql from './002_rules.sql?raw'
import statsSql from './003_stats.sql?raw'
import projectionsSql from './004_projections.sql?raw'
import expertsSql from './005_experts.sql?raw'
import matchupsSql from './006_matchups.sql?raw'

export interface Migration {
  version: number
  name: string
  sql: string
}

export const migrations: Migration[] = [
  { version: 1, name: 'initial', sql: initial },
  { version: 2, name: 'rules', sql: rulesSql },
  { version: 3, name: 'stats', sql: statsSql },
  { version: 4, name: 'projections', sql: projectionsSql },
  { version: 5, name: 'experts', sql: expertsSql },
  { version: 6, name: 'matchups', sql: matchupsSql }
]
