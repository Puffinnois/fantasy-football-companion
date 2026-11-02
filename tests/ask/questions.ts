import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/** The evaluation questions (Ask spec §7), as `questions.json` stores them. */
export interface AskQuestion {
  id: string
  category: string
  question: string
  expect: 'answer' | 'ask' | 'decline' | 'answer_or_ask'
  reference: { tool: string; args: Record<string, unknown> } | null
  split: 'dev' | 'heldout'
  needsLeague?: boolean
  note?: string
  /** A follow-up: the turn before it. */
  previous?: { question: string; reference: { tool: string; args: Record<string, unknown> } }
}

export interface AskQuestionSet {
  about: string
  frozen: { season: number; through: number; seasonType: 'REG' | 'POST'; note: string }
  questions: AskQuestion[]
}

export const QUESTION_SET: AskQuestionSet = JSON.parse(
  readFileSync(join(__dirname, 'questions.json'), 'utf8')
) as AskQuestionSet
