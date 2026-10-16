import { useEffect, useState } from 'react'
import { SectionHead } from '@/components/edition'
import { api } from '@/lib/api'
import { errorMessage, relativeTime } from '@/lib/format'
import { NEWS_PAGE_SIZE, newsAge, sourceBadge } from '@/lib/newsView'
import type { NewsItem, PlayerNews } from '@shared/types'

interface NewsSectionProps {
  playerId: string
  /** Sleeper returns no news for team defenses (research §13): the section is not rendered for them. */
  position: string | null
}

type NewsResult = { status: 'ready'; news: PlayerNews } | { status: 'error'; message: string }

function NewsRow({
  item,
  analysisOpen,
  onToggleAnalysis
}: {
  item: NewsItem
  analysisOpen: boolean
  onToggleAnalysis: () => void
}): React.JSX.Element {
  return (
    <li className="flex flex-col gap-1.5 border-b border-line py-[13px]">
      <div className="flex items-center gap-2 font-mono text-[11px] leading-none font-medium tracking-[0.04em] text-fg-3 uppercase">
        <span className="font-semibold text-brand-fg">{sourceBadge(item.source)}</span>
        <span>·</span>
        <span>{newsAge(item.publishedAt)}</span>
      </div>
      {item.url ? (
        <a
          href={item.url}
          target="_blank"
          rel="noreferrer"
          className="text-[14.5px] leading-[1.3] font-semibold tracking-[-0.01em] text-pretty hover:underline"
        >
          {item.title}
        </a>
      ) : (
        <span className="text-[14.5px] leading-[1.3] font-semibold tracking-[-0.01em] text-pretty">
          {item.title}
        </span>
      )}
      {item.description && (
        <p className="text-[13px] leading-[1.45] text-pretty text-fg-2">{item.description}</p>
      )}
      {item.analysis && (
        <>
          <button
            type="button"
            aria-expanded={analysisOpen}
            onClick={onToggleAnalysis}
            className="self-start font-cond text-[12px] font-bold tracking-[0.1em] text-fg-3 uppercase hover:text-fg"
          >
            Analysis
          </button>
          {analysisOpen && (
            <p className="text-[13px] leading-[1.45] whitespace-pre-line text-fg-2">
              {item.analysis}
            </p>
          )}
        </>
      )}
    </li>
  )
}

/**
 * Spec §5.3: requested when the panel opens, independently of `players.detail`. Every string is
 * rendered as React text. Results are keyed by player + retry count so a stale answer never shows
 * for the next player, and "loading" is simply "no result for the current key".
 */
export function NewsSection({ playerId, position }: NewsSectionProps): React.JSX.Element | null {
  const enabled = position !== 'DEF'
  const [retry, setRetry] = useState<{ playerId: string; n: number }>({ playerId, n: 0 })
  const [result, setResult] = useState<{ key: string; value: NewsResult } | null>(null)
  const [expandedFor, setExpandedFor] = useState<string | null>(null)
  const [analysisOpen, setAnalysisOpen] = useState<Record<string, boolean>>({})
  const force = retry.playerId === playerId && retry.n > 0
  const key = `${playerId}|${force ? retry.n : 0}`

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    void api.players
      .news(playerId, force)
      .then((news) => {
        if (!cancelled) setResult({ key, value: { status: 'ready', news } })
      })
      .catch((err: unknown) => {
        if (!cancelled) setResult({ key, value: { status: 'error', message: errorMessage(err) } })
      })
    return () => {
      cancelled = true
    }
  }, [enabled, playerId, force, key])

  if (!enabled) return null
  const current = result?.key === key ? result.value : null
  const items = current?.status === 'ready' ? current.news.items : []
  const expanded = expandedFor === playerId
  const shown = expanded ? items : items.slice(0, NEWS_PAGE_SIZE)
  // Open by default on the newest item only; an explicit toggle wins.
  const isOpen = (item: NewsItem, index: number): boolean => analysisOpen[item.id] ?? index === 0

  return (
    <section className="flex flex-col">
      <SectionHead
        title="Latest"
        note={
          current?.status === 'ready'
            ? `fetched ${relativeTime(current.news.fetchedAt)}`
            : undefined
        }
      />
      {current === null && (
        <div role="status" aria-label="Loading news" className="space-y-2 pt-3">
          <div className="h-3 w-1/3 animate-pulse rounded bg-panel-2" />
          <div className="h-3 w-5/6 animate-pulse rounded bg-panel-2" />
          <div className="h-3 w-2/3 animate-pulse rounded bg-panel-2" />
        </div>
      )}
      {current?.status === 'error' && (
        <p className="pt-3 text-fg-3" title={current.message}>
          Couldn&apos;t load news.{' '}
          <button
            type="button"
            className="underline"
            onClick={() =>
              setRetry((r) => ({ playerId, n: r.playerId === playerId ? r.n + 1 : 1 }))
            }
          >
            Retry
          </button>
        </p>
      )}
      {current?.status === 'ready' && items.length === 0 && (
        <p className="pt-3 text-fg-3">No news.</p>
      )}
      {shown.length > 0 && (
        <ul>
          {shown.map((item, index) => (
            <NewsRow
              key={item.id}
              item={item}
              analysisOpen={isOpen(item, index)}
              onToggleAnalysis={() =>
                setAnalysisOpen((open) => ({ ...open, [item.id]: !isOpen(item, index) }))
              }
            />
          ))}
        </ul>
      )}
      {!expanded && items.length > NEWS_PAGE_SIZE && (
        <button
          type="button"
          className="mt-3 self-start font-cond text-[13px] font-bold tracking-[0.1em] text-fg-2 uppercase hover:text-fg"
          onClick={() => setExpandedFor(playerId)}
        >
          Show more ({items.length - NEWS_PAGE_SIZE})
        </button>
      )}
    </section>
  )
}
