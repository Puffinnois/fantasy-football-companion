import { useEffect } from 'react'
import { X } from 'lucide-react'

interface SlideOverProps {
  open: boolean
  title: React.ReactNode
  onClose: () => void
  children: React.ReactNode
}

/** Right-edge overlay panel in the player-file style; closes on ×, the scrim or Escape. */
export function SlideOver({
  open,
  title,
  onClose,
  children
}: SlideOverProps): React.JSX.Element | null {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <button
        type="button"
        aria-label="Close"
        className="flex-1 cursor-default bg-scrim"
        onClick={onClose}
      />
      <aside className="flex h-full w-[560px] max-w-full flex-col border-l border-line bg-paper shadow-[-24px_0_64px_var(--shadow-c)]">
        <header className="flex h-[54px] shrink-0 items-center gap-3 border-b border-line pr-5 pl-7">
          <div className="min-w-0 flex-1 font-cond text-[14px] leading-none font-extrabold tracking-[0.14em] text-fg-3 uppercase">
            {title}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close panel"
            title="Close (Esc)"
            className="flex size-[30px] cursor-pointer items-center justify-center rounded-full text-fg-2 hover:bg-hover hover:text-fg"
          >
            <X className="size-[18px]" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-auto px-7 py-5">{children}</div>
      </aside>
    </div>
  )
}
