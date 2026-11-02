import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { openDatabase } from '@main/db/connection'
import { migrate } from '@main/db/migrate'
import { addAskExample, deleteAskExample, listAskExamples } from '@main/db/repos/askExamples'
import { playerIndex } from '@main/analyst/players'
import { resolve } from '@main/analyst/resolve'
import {
  appendTrace,
  maskQuestion,
  queryHash,
  resolverTrace,
  traceCall,
  type Trace
} from '@main/analyst/trace'
import { NOW, PEOPLE } from '../../fixtures/analyst'

const block = (q: string): ReturnType<typeof resolve> =>
  resolve(q, { people: playerIndex(PEOPLE), now: NOW })

describe('traces (Ask spec §5.3)', () => {
  it('record a call by its queries’ hashes, and an error by its message', () => {
    const q = { entity: 'player' as const, metrics: ['yprr'], scope: { seasons: [2026] } }
    expect(queryHash(q)).toMatch(/^[0-9a-f]{12}$/)
    expect(
      traceCall(
        'leaderboard',
        { metric: 'yprr' },
        {
          ok: true,
          tool: 'leaderboard',
          title: '',
          text: '',
          cards: [],
          notes: [],
          queries: [q],
          ms: 9,
          cached: true
        }
      )
    ).toEqual({
      tool: 'leaderboard',
      args: { metric: 'yprr' },
      ok: true,
      ms: 9,
      cached: true,
      queries: [queryHash(q)],
      rows: 0
    })
    expect(
      traceCall('leaderboard', {}, { ok: false, tool: 'leaderboard', error: 'no', ms: 1 })
    ).toMatchObject({ ok: false, error: 'no' })
  })

  it('append one line per turn to log.jsonl', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ask-'))
    const trace: Trace = {
      at: '2026-11-02T10:00:00Z',
      question: 'Puka or JSN?',
      brief: 'abc123abc123',
      profile: 'compact',
      model: 'qwen3:4b',
      mode: 'structured',
      resolver: resolverTrace(block('Puka or JSN?')),
      calls: [],
      checks: [],
      tokens: { input: 900, output: 60 },
      ms: 2100
    }
    appendTrace(dir, trace)
    appendTrace(dir, trace)
    const lines = readFileSync(join(dir, 'log.jsonl'), 'utf8').trim().split('\n')
    expect(lines).toHaveLength(2)
    expect(JSON.parse(lines[0]).resolver).toMatchObject({
      type: 'compare',
      players: ['00-0039075', '00-0038543']
    })
  })

  it('mask a question to its shape', () => {
    expect(maskQuestion(block('Who leads WRs in yards per route run since week 5?'))).toBe(
      'who leads {position} in {metric} since week {n}'
    )
    expect(maskQuestion(block('How does Ja’Marr Chase do against the Ravens in 2025?'))).toBe(
      'how does {player} do against the {opponent} in {season}'
    )
    expect(maskQuestion(block('Bijan rushing yards in 2024 2025'))).toBe(
      '{player} {metric} in {season} {season}'
    )
  })
})

describe('ask_examples (Ask spec §5.3)', () => {
  it('keeps each masked question and call once, newest first', () => {
    const db = openDatabase(':memory:')
    migrate(db)
    const e = {
      question: 'Who leads WRs in YPRR?',
      masked: 'who leads {position} in {metric}',
      tool: 'leaderboard',
      args: { metric: 'yprr', position: 'WR' },
      resultHash: null,
      source: 'user' as const,
      verifiedAt: '2026-11-02T10:00:00Z'
    }
    addAskExample(db, e)
    addAskExample(db, e)
    addAskExample(db, {
      ...e,
      args: { metric: 'tprr', position: 'TE' },
      verifiedAt: '2026-11-02T11:00:00Z'
    })
    const all = listAskExamples(db)
    expect(all.map((x) => x.args.metric)).toEqual(['tprr', 'yprr'])
    deleteAskExample(db, all[0].id)
    expect(listAskExamples(db)).toHaveLength(1)
  })
})
