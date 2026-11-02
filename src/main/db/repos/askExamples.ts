import type { Db } from '../connection'

/** Ask spec §5.3: a verified question → tool-call pair (`ask_examples`). */
export interface AskExample {
  id: number
  question: string
  masked: string
  tool: string
  args: Record<string, unknown>
  resultHash: string | null
  source: 'user' | 'seed'
  verifiedAt: string
}

interface ExampleRow {
  id: number
  question: string
  masked: string
  tool: string
  args_json: string
  result_hash: string | null
  source: 'user' | 'seed'
  verified_at: string
}

/** Adds a pair; the same masked question answered by the same call is kept once. */
export function addAskExample(db: Db, e: Omit<AskExample, 'id'>): void {
  db.prepare(
    `INSERT OR IGNORE INTO ask_examples (question, masked, tool, args_json, result_hash, source, verified_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(e.question, e.masked, e.tool, JSON.stringify(e.args), e.resultHash, e.source, e.verifiedAt)
}

/** Every pair, newest first; a row whose arguments do not parse is left out. */
export function listAskExamples(db: Db): AskExample[] {
  const rows = db
    .prepare('SELECT * FROM ask_examples ORDER BY verified_at DESC, id DESC')
    .all() as unknown as ExampleRow[]
  return rows.flatMap((r) => {
    try {
      const args = JSON.parse(r.args_json) as Record<string, unknown>
      return [
        {
          id: r.id,
          question: r.question,
          masked: r.masked,
          tool: r.tool,
          args,
          resultHash: r.result_hash,
          source: r.source,
          verifiedAt: r.verified_at
        }
      ]
    } catch {
      return []
    }
  })
}

export function deleteAskExample(db: Db, id: number): void {
  db.prepare('DELETE FROM ask_examples WHERE id = ?').run(id)
}
