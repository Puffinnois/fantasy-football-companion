import type { NewsItem } from '@shared/types'

/** Item `i` is `i` hours older than the newest (index 0). */
export function newsItem(i: number, over: Partial<NewsItem> = {}): NewsItem {
  return {
    id: `fantasy_pros:${1000 + i}`,
    source: 'fantasy_pros',
    publishedAt: new Date(Date.UTC(2026, 8, 18, 12, 0, 0) - i * 3_600_000).toISOString(),
    title: `Headline ${i}`,
    description: `Description ${i}`,
    analysis: `Analysis ${i}`,
    url: `https://example.com/${i}`,
    ...over
  }
}

export const newsList = (n: number): NewsItem[] => Array.from({ length: n }, (_, i) => newsItem(i))
