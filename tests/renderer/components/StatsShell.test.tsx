// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { ColumnPicker } from '@/components/stats/ColumnPicker'
import { ScopeBar } from '@/components/stats/ScopeBar'
import { tabOf } from '@/lib/stats/leaderboard'
import { StatsNav } from '@/components/stats/StatsNav'
import type { StatsScope } from '@/lib/stats/scope'
import type { UpdateState } from '@shared/types'
import { catalogue, STATUS } from '../../fixtures/statsScreens'

// Radix popovers measure their content.
globalThis.ResizeObserver ??= class {
  observe = vi.fn()
  unobserve = vi.fn()
  disconnect = vi.fn()
} as unknown as typeof ResizeObserver

afterEach(cleanup)

const SCOPE: StatsScope = { season: 2026, seasonType: 'REG', weeks: null, scoring: 'league' }
const options = (name: string): string[] =>
  within(screen.getByRole('combobox', { name }))
    .getAllByRole('option')
    .map((o) => o.textContent ?? '')

describe('the Stats scope bar (spec §9.1)', () => {
  it('offers the seasons, the weeks with data and the scorings', () => {
    render(<ScopeBar scope={SCOPE} status={STATUS} hasLeague onChange={() => {}} />)
    expect(options('Season')).toEqual([
      '2026',
      '2025',
      '2024',
      '2023',
      '2022',
      '2021',
      '2020',
      '2019'
    ])
    expect(options('To week')).toHaveLength(6)
    expect(options('Fantasy scoring')).toEqual(['My league', 'PPR', 'Half PPR', 'Standard'])
  })

  it('narrows the weeks, keeps them ordered, and resets them with the season', () => {
    const onChange = vi.fn()
    const bar = (scope: StatsScope): React.JSX.Element => (
      <ScopeBar scope={scope} status={STATUS} hasLeague onChange={onChange} />
    )
    const { rerender } = render(bar({ ...SCOPE, weeks: [2, 4] }))
    const pick = (name: string, value: string): void => {
      fireEvent.change(screen.getByRole('combobox', { name }), { target: { value } })
    }
    pick('From week', '5')
    expect(onChange).toHaveBeenLastCalledWith({ ...SCOPE, weeks: [5, 5] })
    pick('To week', '1')
    expect(onChange).toHaveBeenLastCalledWith({ ...SCOPE, weeks: [1, 1] })
    rerender(bar({ ...SCOPE, weeks: [1, 4] }))
    // Weeks 1 to the last with data is the whole season.
    pick('To week', '6')
    expect(onChange).toHaveBeenLastCalledWith({ ...SCOPE, weeks: null })
    pick('Season', '2024')
    expect(onChange).toHaveBeenLastCalledWith({ ...SCOPE, season: 2024, weeks: null })
  })

  it('has no weeks in the postseason and no league scoring without a league', () => {
    render(
      <ScopeBar
        scope={{ ...SCOPE, seasonType: 'POST', scoring: 'ppr' }}
        status={STATUS}
        hasLeague={false}
        onChange={() => {}}
      />
    )
    expect(screen.queryByRole('combobox', { name: 'From week' })).toBeNull()
    expect(options('Fantasy scoring')).toEqual(['PPR', 'Half PPR', 'Standard'])
  })
})

describe('the Stats nav', () => {
  it('shows the screens, the freshness line and the way back to Fantasy', () => {
    const onNavigate = vi.fn()
    const onOpenFantasy = vi.fn()
    render(
      <StatsNav
        current="home"
        onNavigate={onNavigate}
        status={{ ...STATUS, busy: true }}
        hasLeague={false}
        onOpenFantasy={onOpenFantasy}
        update={{ status: 'idle' } as UpdateState}
        version="0.28.0"
        onOpenUpdate={() => {}}
        onToggleTheme={() => {}}
      />
    )
    expect(screen.getByRole('button', { name: 'Leaderboards' }).getAttribute('aria-current')).toBe(
      'page'
    )
    expect((screen.getByRole('button', { name: 'Games' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Glossary' }))
    expect(onNavigate).toHaveBeenCalledWith('glossary')
    expect(screen.getByText('Data through 2026 week 6 · updating…')).toBeTruthy()
    const fantasy = screen.getByRole('button', { name: /Fantasy ↗/ })
    expect(fantasy.title).toBe('Import a Sleeper league in Fantasy')
    fireEvent.click(fantasy)
    expect(onOpenFantasy).toHaveBeenCalled()
  })
})

describe('the column picker', () => {
  it('adds a column at the end and never removes the last one (review fix)', () => {
    const onChange = vi.fn()
    const picker = (columns: string[]): React.JSX.Element => (
      <ColumnPicker
        tab={tabOf('player', 'WR')}
        catalogue={catalogue()}
        columns={columns}
        onChange={onChange}
        onReset={() => {}}
      />
    )
    const { rerender } = render(picker(['yprr', 'targets']))
    fireEvent.click(screen.getByRole('button', { name: /Columns/ }))
    fireEvent.click(screen.getByRole('checkbox', { name: /Separation/ }))
    expect(onChange).toHaveBeenLastCalledWith(['yprr', 'targets', 'separation'])
    fireEvent.click(screen.getByRole('checkbox', { name: /Targets per route run/ }))
    fireEvent.click(screen.getByRole('checkbox', { name: /^Yards per route run/ }))
    expect(onChange).toHaveBeenLastCalledWith(['targets'])
    rerender(picker(['yprr']))
    expect(
      (screen.getByRole('checkbox', { name: /^Yards per route run/ }) as HTMLInputElement).disabled
    ).toBe(true)
  })
})
