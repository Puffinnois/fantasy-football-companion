import type { SuggestProgress, SuggestSnapshot, SuggestUpdate } from './types'

/** A run that has not reported yet. */
export const EMPTY_PROGRESS: SuggestProgress = {
  checked: 0,
  total: 0,
  found: 0,
  size: 2,
  elapsedMs: 0
}

/** Multi-team spec §4: a run after one update — main's run manager and the screen apply the same rule. */
export function applyUpdate(snap: SuggestSnapshot, update: SuggestUpdate): SuggestSnapshot {
  switch (update.type) {
    case 'cards':
      return { ...snap, cards: [...snap.cards, ...update.cards] }
    case 'progress':
      return { ...snap, progress: update.progress }
    case 'done':
      return { ...snap, progress: update.progress, status: update.reason }
    case 'error':
      return { ...snap, status: 'error', message: update.message }
  }
}
