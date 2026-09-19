import { useEffect, useState } from 'react'
import { Section } from '@/components/Section'
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
    <li className="text-sm">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="rounded bg-muted px-1 font-medium">{sourceBadge(item.source)}</span>
        <span className="tabular-nums">{newsAge(item.publishedAt)}</span>
      </div>
      {item.url ? (
        <a href={item.url} target="_blank" rel="noreferrer" className="font-medium hover:underline">
          {item.title}
        </a>
      ) : (
        <span className="font-medium">{item.title}</span>
      )}
      {item.description && <p className="mt-0.5 text-muted-foreground">{item.description}</p>}
      {item.analysis && (
        <>
          <button
            type="button"
            aria-expanded={analysisOpen}
            onClick={onToggleAnalysis}
            className="mt-0.5 text-xs text-muted-foreground underline"
          >
            Analysis
          </button>
          {analysisOpen && <p className="mt-1 whitespace-pre-line">{item.analysis}</p>}
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
    <Section
      title="News"
      note={
        current?.status === 'ready' ? `fetched ${relativeTime(current.news.fetchedAt)}` : undefined
      }
    >
      {current === null && (
        <div role="status" aria-label="Loading news" className="space-y-2">
          <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
          <div className="h-3 w-5/6 animate-pulse rounded bg-muted" />
          <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
        </div>
      )}
      {current?.status === 'error' && (
        <p className="text-sm text-muted-foreground" title={current.message}>
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
        <p className="text-sm text-muted-foreground">No news.</p>
      )}
      {shown.length > 0 && (
        <ul className="space-y-3">
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
          className="mt-2 text-sm text-muted-foreground underline"
          onClick={() => setExpandedFor(playerId)}
        >
          Show more ({items.length - NEWS_PAGE_SIZE})
        </button>
      )}
    </Section>
  )
}
