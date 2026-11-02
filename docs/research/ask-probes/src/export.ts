import { writeFileSync } from 'node:fs'
import { CATALOGUE } from '@shared/stats/catalogue'
import { statsQuerySchema } from '@shared/stats/querySchema'
import { TEAM_NAMES } from '@shared/stats/nflTeams'
const out = process.argv[2]
writeFileSync(`${out}/catalogue.json`, JSON.stringify(CATALOGUE, null, 1))
writeFileSync(
  `${out}/querySchema.json`,
  JSON.stringify(statsQuerySchema(CATALOGUE.map((m) => m.id)), null, 1)
)
writeFileSync(`${out}/teams.json`, JSON.stringify(TEAM_NAMES, null, 1))
