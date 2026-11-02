import { describe, expect, it } from 'vitest'
import { check } from '@main/analyst/schema'
import { toolDefinitions } from '@main/analyst/tools'
import { QUESTION_SET } from './questions'

const SEASONS = Array.from({ length: QUESTION_SET.frozen.season - 2019 + 1 }, (_, i) => 2019 + i)
const TOOLS = new Map(toolDefinitions(SEASONS).map((d) => [d.name, d.schema]))
const { questions } = QUESTION_SET

describe('the evaluation questions (Ask spec §7)', () => {
  it('have unique ids, known categories and expectations', () => {
    expect(new Set(questions.map((q) => q.id)).size).toBe(questions.length)
    expect(questions.length).toBeGreaterThanOrEqual(150)
    for (const q of questions) {
      expect(['answer', 'ask', 'decline', 'answer_or_ask'], q.id).toContain(q.expect)
      expect(q.question.length, q.id).toBeGreaterThan(3)
    }
  })

  it('give every question that has an answer a reference call the tools accept', () => {
    const problems: string[] = []
    for (const q of questions) {
      const refs = [q.reference, q.previous?.reference].filter((r) => r !== null && r !== undefined)
      if ((q.expect === 'answer' || q.expect === 'answer_or_ask') && !q.reference) {
        problems.push(`${q.id}: no reference`)
      }
      for (const r of refs) {
        const schema = TOOLS.get(r!.tool as never)
        if (!schema) problems.push(`${q.id}: no tool ${r!.tool}`)
        else {
          const error = check(schema, r!.args)
          if (error) problems.push(`${q.id}: ${error}`)
        }
      }
    }
    expect(problems).toEqual([])
  })

  it('hold out about a third of each category, never tuned on', () => {
    const held = questions.filter((q) => q.split === 'heldout').length / questions.length
    expect(held).toBeGreaterThan(0.25)
    expect(held).toBeLessThan(0.4)
    const categories = new Set(questions.map((q) => q.category))
    for (const c of categories) {
      const items = questions.filter((q) => q.category === c)
      if (items.length >= 3)
        expect(
          items.some((q) => q.split === 'heldout'),
          c
        ).toBe(true)
    }
  })
})
