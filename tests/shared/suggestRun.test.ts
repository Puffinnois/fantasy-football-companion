import { describe, expect, it } from 'vitest'
import { applyUpdate, EMPTY_PROGRESS } from '@shared/suggestRun'
import type { SuggestSnapshot } from '@shared/types'
import { tradeSuggestion } from '../fixtures/trade'

const running: SuggestSnapshot = {
  runId: 4,
  query: { season: 2026, focus: null, stance: 'fair', maxTeams: 3, mustInclude: null },
  cards: [],
  progress: EMPTY_PROGRESS,
  status: 'running',
  message: null
}
const progress = { checked: 5, total: 9, found: 1, size: 3, elapsedMs: 1200 }

describe('applyUpdate (spec §4)', () => {
  it('appends cards, replaces progress and ends on done or error', () => {
    const card = tradeSuggestion()
    const withCards = applyUpdate(running, { type: 'cards', cards: [card, card] })
    expect(withCards.cards).toEqual([card, card])
    expect(applyUpdate(withCards, { type: 'cards', cards: [card] }).cards).toHaveLength(3)
    expect(applyUpdate(running, { type: 'progress', progress }).progress).toEqual(progress)
    expect(applyUpdate(running, { type: 'done', reason: 'full', progress })).toMatchObject({
      status: 'full',
      progress
    })
    expect(applyUpdate(running, { type: 'error', message: 'boom' })).toMatchObject({
      status: 'error',
      message: 'boom'
    })
    expect(running.cards).toEqual([]) // never mutated
  })
})
