import type { AskCall, AskFlag, AskMessage, AskThread, ToolOutcome } from '@shared/ask'
import type { Db } from '../connection'

/**
 * Ask spec §5.3: threads and their messages (`ask_threads`, `ask_messages`), kept until deleted.
 * An assistant message also keeps the provider's own transcript of its turn and the follow-up state
 * (Plan AG1, amendment G); neither reaches the renderer.
 */
export interface StoredTurn {
  /**
   * What wrote `transcript`: the provider's kind, model and calling mode (`askService`'s writer).
   * Another provider, model or mode reads the thread as text.
   */
  writer: string | null
  transcript: unknown[] | null
  state: unknown
}

interface ThreadRow {
  id: number
  title: string
  created_at: string
  updated_at: string
}

interface MessageRow {
  id: number
  thread_id: number
  role: 'user' | 'assistant'
  text: string
  calls_json: string
  results_json: string
  flags_json: string
  outcome: AskMessage['outcome']
  model: string | null
  writer: string | null
  transcript_json: string | null
  state_json: string | null
  input_tokens: number | null
  output_tokens: number | null
  ms: number | null
  created_at: string
}

const thread = (r: ThreadRow): AskThread => ({
  id: r.id,
  title: r.title,
  createdAt: r.created_at,
  updatedAt: r.updated_at
})

/** A JSON column, or its fallback when it does not parse. */
function parsed<T>(json: string | null, fallback: T): T {
  if (json === null) return fallback
  try {
    return JSON.parse(json) as T
  } catch {
    return fallback
  }
}

const message = (r: MessageRow): AskMessage => ({
  id: r.id,
  threadId: r.thread_id,
  role: r.role,
  text: r.text,
  calls: parsed<AskCall[]>(r.calls_json, []),
  results: parsed<ToolOutcome[]>(r.results_json, []),
  flags: parsed<AskFlag[]>(r.flags_json, []),
  outcome: r.outcome,
  model: r.model,
  tokens:
    r.input_tokens === null || r.output_tokens === null
      ? null
      : { input: r.input_tokens, output: r.output_tokens },
  ms: r.ms,
  createdAt: r.created_at
})

export function createAskThread(db: Db, title: string, at: string): AskThread {
  const r = db
    .prepare('INSERT INTO ask_threads (title, created_at, updated_at) VALUES (?, ?, ?) RETURNING *')
    .get(title, at, at) as unknown as ThreadRow
  return thread(r)
}

/** Every thread, most recently used first. */
export function listAskThreads(db: Db): AskThread[] {
  const rows = db
    .prepare('SELECT * FROM ask_threads ORDER BY updated_at DESC, id DESC')
    .all() as unknown as ThreadRow[]
  return rows.map(thread)
}

export function getAskThread(db: Db, id: number): AskThread | null {
  const r = db.prepare('SELECT * FROM ask_threads WHERE id = ?').get(id) as unknown as
    ThreadRow | undefined
  return r ? thread(r) : null
}

/** Deletes a thread and its messages. */
export function deleteAskThread(db: Db, id: number): void {
  db.prepare('DELETE FROM ask_threads WHERE id = ?').run(id)
}

/** Adds a message and marks its thread used. */
export function addAskMessage(
  db: Db,
  m: Omit<AskMessage, 'id'>,
  turn: StoredTurn = { writer: null, transcript: null, state: null }
): AskMessage {
  const r = db
    .prepare(
      `INSERT INTO ask_messages (thread_id, role, text, calls_json, results_json, flags_json, outcome,
         model, writer, transcript_json, state_json, input_tokens, output_tokens, ms, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`
    )
    .get(
      m.threadId,
      m.role,
      m.text,
      JSON.stringify(m.calls),
      JSON.stringify(m.results),
      JSON.stringify(m.flags),
      m.outcome,
      m.model,
      turn.writer,
      turn.transcript === null ? null : JSON.stringify(turn.transcript),
      turn.state === null || turn.state === undefined ? null : JSON.stringify(turn.state),
      m.tokens?.input ?? null,
      m.tokens?.output ?? null,
      m.ms,
      m.createdAt
    ) as unknown as MessageRow
  db.prepare('UPDATE ask_threads SET updated_at = ? WHERE id = ?').run(m.createdAt, m.threadId)
  return message(r)
}

/** A thread's messages, oldest first. */
export function listAskMessages(db: Db, threadId: number): AskMessage[] {
  const rows = db
    .prepare('SELECT * FROM ask_messages WHERE thread_id = ? ORDER BY id')
    .all(threadId) as unknown as MessageRow[]
  return rows.map(message)
}

/** The thread's messages with what main keeps of each turn: for the loop, never the renderer. */
export function listAskTurns(
  db: Db,
  threadId: number
): { message: AskMessage; turn: StoredTurn }[] {
  const rows = db
    .prepare('SELECT * FROM ask_messages WHERE thread_id = ? ORDER BY id')
    .all(threadId) as unknown as MessageRow[]
  return rows.map((r) => ({
    message: message(r),
    turn: {
      writer: r.writer,
      transcript: parsed<unknown[] | null>(r.transcript_json, null),
      state: parsed<unknown>(r.state_json, null)
    }
  }))
}
