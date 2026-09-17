import { useEffect } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface SlideOverProps {
  open: boolean
  title: React.ReactNode
  onClose: () => void
  children: React.ReactNode
}

/** Right-edge overlay panel; closes on the X button, the backdrop or Escape. */
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
      <button type="button" aria-label="Close" className="flex-1 bg-black/40" onClick={onClose} />
      <aside className="flex h-full w-[520px] max-w-full flex-col border-l bg-background shadow-xl">
        <header className="flex items-center gap-2 border-b px-4 py-3">
          <div className="min-w-0 flex-1 text-sm font-semibold">{title}</div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2"
            onClick={onClose}
            aria-label="Close panel"
          >
            <X className="size-4" />
          </Button>
        </header>
        <div className="min-h-0 flex-1 overflow-auto p-4">{children}</div>
      </aside>
    </div>
  )
}
