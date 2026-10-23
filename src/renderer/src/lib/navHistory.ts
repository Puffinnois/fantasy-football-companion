import { useCallback, useRef, useState } from 'react'
import type { Screen } from '@/components/TopNav'
import type { StatsScreen } from '@/components/stats/StatsNav'
import type { PositionGroup } from '@shared/stats/types'

/**
 * A page Back returns to (N-002): a product's screen and, on a dashboard, its player or team.
 * Tabs, scopes and filters stay as they are.
 */
export type NavLocation =
  | { product: 'fantasy'; screen: Screen; playerId: string | null }
  | {
      product: 'stats'
      screen: StatsScreen
      team: string | null
      player: { id: string; position: PositionGroup | null } | null
    }

/** Pages kept; the oldest go first. */
export const BACK_LIMIT = 50

// The same player is the same page, whichever position he was opened under.
const keyOf = (l: NavLocation): string =>
  JSON.stringify(l.product === 'stats' ? { ...l, player: l.player?.id ?? null } : l)

export interface BackStack {
  canGoBack: boolean
  /** Called with every page shown; a new one puts the page before it on the stack. */
  report: (location: NavLocation) => void
  /** The page to return to, taken off the stack; the next report is that page, not a new one. */
  back: () => NavLocation | null
}

export function useBackStack(): BackStack {
  const [stack, setStack] = useState<NavLocation[]>([])
  const current = useRef<NavLocation | null>(null)
  const restoring = useRef(false)

  const report = useCallback((location: NavLocation) => {
    const was = current.current
    current.current = location
    if (was === null || keyOf(was) === keyOf(location)) return
    if (restoring.current) {
      restoring.current = false
      return
    }
    setStack((s) => [...s, was].slice(-BACK_LIMIT))
  }, [])

  const back = useCallback((): NavLocation | null => {
    const to = stack.at(-1)
    if (!to) return null
    restoring.current = true
    setStack(stack.slice(0, -1))
    return to
  }, [stack])

  return { canGoBack: stack.length > 0, report, back }
}

/** Alt+← and the mouse's back button; not while typing, where Alt+← belongs to the text. */
export function isBackGesture(e: KeyboardEvent | MouseEvent): boolean {
  if (e instanceof MouseEvent) return e.button === 3
  if (e.key !== 'ArrowLeft' || !e.altKey || e.ctrlKey || e.shiftKey || e.metaKey) return false
  const t = e.target
  return !(
    t instanceof HTMLElement &&
    (t.isContentEditable || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')
  )
}
