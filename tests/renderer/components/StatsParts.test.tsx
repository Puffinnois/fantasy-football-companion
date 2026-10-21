// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Headshot, HeatCell, PlayerName } from '@/components/stats/parts'
import { StatSection } from '@/components/stats/StatLines'

afterEach(cleanup)

describe('the dashboards’ shared pieces', () => {
  it('shows Sleeper’s headshot, and the initials without one or when it fails to load', () => {
    render(<Headshot name="Ja'Marr Chase" sleeperId="7564" />)
    const img = screen.getByRole('img', { name: "Ja'Marr Chase" })
    expect(img.getAttribute('src')).toBe(
      'https://sleepercdn.com/content/nfl/players/thumb/7564.jpg'
    )
    fireEvent.error(img)
    expect(screen.getByRole('img', { name: "Ja'Marr Chase" }).textContent).toBe('JC')
    cleanup()
    render(<Headshot name="Brandon Aubrey" sleeperId={null} />)
    expect(screen.getByRole('img', { name: 'Brandon Aubrey' }).textContent).toBe('BA')
  })

  it('opens a player from his name when the table can', () => {
    const open = vi.fn()
    render(<PlayerName name="Tee Higgins" position="WR" mine onOpen={open} />)
    fireEvent.click(screen.getByRole('button', { name: /Tee Higgins/ }))
    expect(open).toHaveBeenCalledOnce()
    cleanup()
    render(<PlayerName name="Tee Higgins" position="WR" mine={false} />)
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('shades a split cell and writes its rank', () => {
    render(<HeatCell value="+0.31" rank="2nd" heat="h3" title="2nd among qualified WRs" />)
    const cell = screen.getByTitle('2nd among qualified WRs')
    expect(cell.className).toContain('bg-h3')
    expect(cell.textContent).toBe('+0.312nd')
  })

  it('says what a section’s data covers beside its title', () => {
    render(
      <StatSection section={{ title: 'Man and zone', note: 'Participation data.', lines: [] }} />
    )
    expect(screen.getByRole('heading', { name: 'Man and zone' })).toBeTruthy()
    expect(screen.getByText('Participation data.')).toBeTruthy()
  })
})
