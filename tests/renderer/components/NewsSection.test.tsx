// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { NewsSection } from '@/components/NewsSection'
import { api } from '@/lib/api'
import type { NewsItem, PlayerNews } from '@shared/types'
import { newsItem, newsList } from '../../fixtures/news'

vi.mock('@/lib/api', () => ({ api: { players: { news: vi.fn() } } }))
const newsMock = vi.mocked(api.players.news)

const ready = (items: NewsItem[] = newsList(3)): PlayerNews => ({
  items,
  fetchedAt: '2026-09-18T12:00:00.000Z'
})

beforeEach(() => {
  newsMock.mockReset()
})
afterEach(cleanup)

describe('NewsSection', () => {
  it('shows a loading state, requests the news once, then renders the list with badges', async () => {
    newsMock.mockResolvedValueOnce(ready())
    render(<NewsSection playerId="4046" position="QB" />)
    expect(screen.getByRole('status', { name: 'Loading news' })).toBeTruthy()
    expect(await screen.findByText('Headline 0')).toBeTruthy()
    expect(newsMock).toHaveBeenCalledTimes(1)
    expect(newsMock).toHaveBeenCalledWith('4046', false)
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.getAllByRole('link').map((a) => a.textContent)).toEqual([
      'Headline 0',
      'Headline 1',
      'Headline 2'
    ])
    expect(screen.getByText('Description 1')).toBeTruthy()
    expect(screen.getAllByText('FP')).toHaveLength(3)
    expect(screen.getByText('News')).toBeTruthy()
  })

  it('renders nothing and requests nothing for a team defense', () => {
    const { container } = render(<NewsSection playerId="LAR" position="DEF" />)
    expect(container.innerHTML).toBe('')
    expect(newsMock).not.toHaveBeenCalled()
  })

  it('shows the failure state and retries with force', async () => {
    newsMock.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(ready(newsList(1)))
    render(<NewsSection playerId="4046" position="QB" />)
    expect(await screen.findByText(/Couldn't load news/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText('Headline 0')).toBeTruthy()
    expect(newsMock).toHaveBeenNthCalledWith(2, '4046', true)
  })

  it('says so when there is no news', async () => {
    newsMock.mockResolvedValueOnce(ready([]))
    render(<NewsSection playerId="4046" position="QB" />)
    expect(await screen.findByText('No news.')).toBeTruthy()
  })

  it('shows 8 items, reveals the rest on "Show more", and opens analysis on the newest only', async () => {
    newsMock.mockResolvedValueOnce(ready(newsList(10)))
    render(<NewsSection playerId="4046" position="QB" />)
    await screen.findByText('Headline 0')
    expect(screen.getAllByRole('link')).toHaveLength(8)
    expect(screen.getByText('Analysis 0')).toBeTruthy()
    expect(screen.queryByText('Analysis 1')).toBeNull()

    const toggles = screen.getAllByRole('button', { name: 'Analysis' })
    expect(toggles[0].getAttribute('aria-expanded')).toBe('true')
    fireEvent.click(toggles[1])
    expect(screen.getByText('Analysis 1')).toBeTruthy()
    fireEvent.click(toggles[0])
    expect(screen.queryByText('Analysis 0')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Show more (2)' }))
    expect(screen.getAllByRole('link')).toHaveLength(10)
    expect(screen.queryByRole('button', { name: /Show more/ })).toBeNull()
  })

  it('links the title to the article in a new window, or keeps it plain text without a URL', async () => {
    newsMock.mockResolvedValueOnce(
      ready([newsItem(0), newsItem(1, { url: null, analysis: null, description: null })])
    )
    render(<NewsSection playerId="4046" position="QB" />)
    const link = (await screen.findByText('Headline 0')).closest('a')
    expect(link?.getAttribute('href')).toBe('https://example.com/0')
    expect(link?.getAttribute('target')).toBe('_blank')
    expect(link?.getAttribute('rel')).toBe('noreferrer')
    expect(screen.getByText('Headline 1').closest('a')).toBeNull()
    expect(screen.getAllByRole('button', { name: 'Analysis' })).toHaveLength(1)
  })

  it('renders every string as text, never as HTML', async () => {
    newsMock.mockResolvedValueOnce(
      ready([newsItem(0, { title: '<b>Bold</b>', analysis: '<img src=x onerror=alert(1)>' })])
    )
    const { container } = render(<NewsSection playerId="4046" position="QB" />)
    expect(await screen.findByText('<b>Bold</b>')).toBeTruthy()
    expect(container.querySelector('b')).toBeNull()
    expect(container.querySelector('img')).toBeNull()
  })

  it('refetches when the player changes and never shows the previous list meanwhile', async () => {
    newsMock.mockResolvedValueOnce(ready(newsList(1))).mockResolvedValueOnce(ready([newsItem(5)]))
    const { rerender } = render(<NewsSection playerId="1" position="RB" />)
    await screen.findByText('Headline 0')
    rerender(<NewsSection playerId="2" position="RB" />)
    expect(screen.getByRole('status', { name: 'Loading news' })).toBeTruthy()
    expect(screen.queryByText('Headline 0')).toBeNull()
    expect(await screen.findByText('Headline 5')).toBeTruthy()
    expect(newsMock).toHaveBeenNthCalledWith(2, '2', false)
  })
})
