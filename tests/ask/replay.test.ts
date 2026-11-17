import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { CallingMode, ToolProfile } from '@shared/ask'
import type { Person } from '@shared/stats/types'
import { askTurn } from '@main/analyst/loop'
import { type Recording, replayAnalyst, replaying } from '@main/analyst/providers/replay'
import { type AnalystStats, createAnalyst } from '@main/analyst/tools'
import { catalogueInfo } from '@main/stats/engine/registry'
import { statsResult, statsRow } from '../fixtures/analyst'

/**
 * Ask spec §10 (Plan AG1, amendment E): recorded model replies and tool outcomes, replayed through
 * the real loop with no model and no database (the tools on the database are `npm run test:ask`'s). Each turn must ask the model the same things in the same order and make
 * the same calls: a change to the resolver, the compact schema or the loop that alters an answer
 * fails here. The recordings come from `tests/ask/loop.live.test.ts` with FFC_ASK_RECORD=1.
 */
interface ReplayFile {
  model: string
  profile: ToolProfile
  mode: CallingMode
  through: { season: number; week: number; seasonType: 'REG' | 'POST' }
  people: Person[]
  recordings: Recording[]
}

const DIR = join(__dirname, 'replays')
const FILES = readdirSync(DIR).filter((f) => f.endsWith('.json'))

/** An engine that knows the recorded players and answers every query with one row. */
function engine(file: ReplayFile): AnalystStats {
  return {
    status: async () => ({
      available: true,
      through: file.through,
      updatedAt: 'replay',
      busy: false
    }),
    catalogue: async () => catalogueInfo(new Map()),
    people: async () => file.people,
    query: async (q) => {
      const p = file.people[0] ?? { id: '00-0000001', name: 'Replay Player' }
      const values = Object.fromEntries(q.metrics.map((m) => [m, { raw: 1, sample: 100 }]))
      return statsResult([statsRow(p.id, p.name, values)])
    },
    games: async () => [],
    outlook: async () => {
      throw new Error('no outlook in a replay')
    },
    player: async () => {
      throw new Error('no player in a replay')
    }
  }
}

describe('recorded model replies', () => {
  it('exist', () => expect(FILES.length).toBeGreaterThan(0))

  for (const name of FILES) {
    const file = JSON.parse(readFileSync(join(DIR, name), 'utf8')) as ReplayFile
    it(`replay ${name}`, async () => {
      const analyst = createAnalyst({ stats: engine(file), league: () => null })
      const problems: string[] = []
      for (const rec of file.recordings) {
        const provider = replaying(rec)
        try {
          const out = await askTurn({
            question: rec.question,
            provider,
            analyst: rec.outcomes ? replayAnalyst(analyst, rec.outcomes) : analyst,
            profile: file.profile,
            mode: file.mode,
            reasoning: 'off',
            history: [],
            last: null,
            examples: null,
            sampleK: false,
            signal: new AbortController().signal,
            emit: () => {}
          })
          if (provider.left() > 0) problems.push(`${rec.question}: ${provider.left()} calls unused`)
          if (rec.expect && JSON.stringify(out.calls) !== JSON.stringify(rec.expect.calls))
            problems.push(`${rec.question}: calls ${JSON.stringify(out.calls)}`)
        } catch (err) {
          problems.push(String(err))
        }
      }
      expect(problems).toEqual([])
    })
  }
})
