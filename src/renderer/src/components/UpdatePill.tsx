import { CircleArrowUp } from 'lucide-react'
import type { UpdateState } from '@shared/types'

interface UpdatePillProps {
  state: UpdateState
  onOpen: () => void
}

function label(state: UpdateState): string | null {
  switch (state.status) {
    case 'available':
    case 'ready':
      return `Update to ${state.version}`
    case 'downloading':
      return `Downloading ${state.percent}%`
    default:
      return null
  }
}

/** Sidebar button shown while an update is known; the dialog does the rest. */
export function UpdatePill({ state, onOpen }: UpdatePillProps): React.JSX.Element | null {
  const text = label(state)
  if (text === null) return null
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center justify-center gap-2 rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-500"
    >
      <CircleArrowUp className="size-4" />
      {text}
    </button>
  )
}
