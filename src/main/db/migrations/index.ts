import initial from './001_initial.sql?raw'
import rulesSql from './002_rules.sql?raw'
import statsSql from './003_stats.sql?raw'
import projectionsSql from './004_projections.sql?raw'

export interface Migration {
  version: number
  name: string
  sql: string
}

export const migrations: Migration[] = [
  { version: 1, name: 'initial', sql: initial },
  { version: 2, name: 'rules', sql: rulesSql },
  { version: 3, name: 'stats', sql: statsSql },
  { version: 4, name: 'projections', sql: projectionsSql }
]
