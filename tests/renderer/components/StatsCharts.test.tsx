// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { PercentileBar, StatSection } from '@/components/stats/StatLines'
import { SeasonChart } from '@/components/stats/SeasonChart'
import { WeekChart } from '@/components/stats/WeekChart'
import type { SectionView } from '@/lib/stats/team'
import type { TrendPoint } from '@/lib/stats/trends'
import { catalogueMap } from '../../fixtures/statsScreens'

afterEach(cleanup)

const byId = catalogueMap()

describe('the dashboard’s stat lines and charts', () => {
  it('writes a line: label, value, percentile pill, rank and league; or why it is empty', () => {
    const section: SectionView = {
      title: 'Passing',
      lines: [
        {
          key: 'all:off_pass_epa',
          metric: 'off_pass_epa',
          label: 'EPA per dropback',
          info: byId.get('off_pass_epa')!,
          value: '+0.283',
          rank: '3rd of 32',
          percentile: 93.5,
          heat: 'h3',
          league: '+0.060',
          title: 'Rank 3',
          missing: null
        },
        {
          key: 'all:off_pressure_rate',
          metric: 'off_pressure_rate',
          label: 'Pressure rate',
          info: byId.get('off_pressure_rate')!,
          value: '—',
          rank: null,
          percentile: null,
          heat: 'n',
          league: null,
          title: '',
          missing: 'Not published for 2026 yet.'
        }
      ]
    }
    render(<StatSection section={section} />)
    expect(screen.getByRole('heading', { name: 'Passing' })).toBeTruthy()
    const line = screen.getByText('EPA per dropback').closest('[data-metric]')!
    expect(within(line as HTMLElement).getByText('+0.283')).toBeTruthy()
    expect(within(line as HTMLElement).getByText('94')).toBeTruthy()
    expect(within(line as HTMLElement).getByText('3rd of 32')).toBeTruthy()
    expect(within(line as HTMLElement).getByText('Lg +0.060')).toBeTruthy()
    expect(screen.getByText('Not published for 2026 yet.')).toBeTruthy()
  })

  it('places the percentile pill along the track', () => {
    render(<PercentileBar percentile={25} />)
    expect(screen.getByRole('img', { name: '25th percentile' })).toBeTruthy()
    expect(screen.getByText('25').getAttribute('style')).toContain('calc(25% - 13px)')
  })

  it('charts weeks with gaps, a legend, end labels, and a hover listing each series', () => {
    render(
      <WeekChart
        label="Test chart"
        format={(v) => v.toFixed(1)}
        series={[
          {
            id: 'a',
            label: 'Offense',
            points: [
              { week: 1, value: 0.2 },
              { week: 2, value: null },
              { week: 3, value: 0.4 }
            ]
          },
          {
            id: 'b',
            label: 'Defense',
            points: [
              { week: 1, value: -0.1 },
              { week: 2, value: 0.1 },
              { week: 3, value: 0 }
            ]
          }
        ]}
      />
    )
    const chart = screen.getByRole('img', { name: 'Test chart' })
    // The bye splits the first line in two.
    expect(chart.querySelectorAll('path')[0].getAttribute('d')!.match(/M/g)).toHaveLength(2)
    expect(screen.getAllByText('Offense').length).toBeGreaterThan(0)
    // Each line ends with its last value.
    const ends = [...chart.querySelectorAll('text.fill-fg-2')].map((t) => t.textContent)
    expect(ends.sort()).toEqual(['0.0', '0.4'])
    fireEvent.mouseMove(chart, { clientX: 0 })
    const tip = screen.getByRole('tooltip')
    expect(within(tip).getByText('Week 1')).toBeTruthy()
    expect(within(tip).getByText('-0.1')).toBeTruthy()
  })

  it('survives the weeks shrinking under the mouse, and keys end labels to their line', () => {
    const series = (weeks: number[]): Parameters<typeof WeekChart>[0]['series'] => [
      { id: 'a', label: 'Offense', points: weeks.map((week) => ({ week, value: week / 10 })) }
    ]
    const { rerender } = render(
      <WeekChart label="Shrink" format={(v) => v.toFixed(1)} series={series([19, 20, 21, 22])} />
    )
    const chart = screen.getByRole('img', { name: 'Shrink' })
    fireEvent.mouseMove(chart, { clientX: 10_000 })
    expect(within(screen.getByRole('tooltip')).getByText('Week 22')).toBeTruthy()
    rerender(<WeekChart label="Shrink" format={(v) => v.toFixed(1)} series={series([19])} />)
    expect(screen.queryByRole('tooltip')).toBeNull()
    // The end label carries its series' swatch.
    const end = chart.querySelector('[data-end="a"]')!
    expect(end.querySelector('rect')!.getAttribute('fill')).toBe('var(--s1)')
  })

  it('keeps a slot’s colour and shape, dashes the median, and flips a lower-is-better axis', () => {
    const points = (vs: number[]): { week: number; value: number }[] =>
      vs.map((value, i) => ({ week: i + 1, value }))
    const props = {
      label: 'Slots',
      format: (v: number) => v.toFixed(2),
      series: [
        { id: 'a', slot: 0, label: 'BUF', points: points([0.1, 0.2]) },
        { id: 'c', slot: 2, label: 'MIA', points: points([-0.1, 0]) }
      ],
      reference: { id: 'median', label: 'League median', points: points([0, 0]) }
    }
    const { rerender } = render(<WeekChart {...props} />)
    const chart = screen.getByRole('img', { name: 'Slots' })
    expect(chart.querySelector('[data-reference]')!.getAttribute('stroke-dasharray')).toBe('5 4')
    // Slot 3 (an open slot 2 between) keeps --s3 and draws diamonds.
    const diamonds = [...chart.querySelectorAll('path[fill="var(--s3)"]')]
    expect(diamonds).toHaveLength(2)
    expect(screen.getByText('League median')).toBeTruthy()
    const top = (): number =>
      Number(chart.querySelector('rect[fill="var(--s1)"]')!.getAttribute('y'))
    const y = top()
    rerender(<WeekChart {...props} flip />)
    expect(top()).toBeGreaterThan(y)
  })

  it('charts seasons: the band and median, a season not qualified hollow, team changes', () => {
    const point = (season: number, value: number | null, qualified = true): TrendPoint => ({
      season,
      value,
      qualified,
      percentile: qualified ? 60 : null,
      rank: qualified ? 10 : null,
      of: 90,
      sample: 300,
      estimated: false
    })
    render(
      <SeasonChart
        label="YPRR by season"
        format={(v) => v.toFixed(2)}
        series={[
          { id: 'p1', label: 'Okafor', points: [point(2024, 1.9), point(2025, 2.2, false)] },
          { id: 'p2', label: 'Reyes', points: [point(2024, 1.5), point(2025, 1.6)] }
        ]}
        band={[
          { season: 2024, p25: 1.3, median: 1.6, p75: 2 },
          { season: 2025, p25: 1.2, median: 1.6, p75: 1.9 }
        ]}
        marks={new Map([[2025, 'BUF']])}
        ages={new Map([[2025, 25]])}
        hoverInfo={(season) => ({ title: String(season), lines: ['2.20'] })}
      />
    )
    const chart = screen.getByRole('img', { name: 'YPRR by season' })
    expect(chart.querySelector('[data-band]')).toBeTruthy()
    expect(chart.querySelector('[data-median]')!.getAttribute('stroke-dasharray')).toBe('5 4')
    // Only the main series marks a season below the qualifier hollow.
    expect(chart.querySelectorAll('[data-hollow]')).toHaveLength(1)
    expect(chart.querySelector('[data-team-mark]')!.textContent).toBe('BUF')
    expect(screen.getByText('age 25')).toBeTruthy()
    fireEvent.mouseEnter(chart.querySelectorAll('rect[fill="transparent"]')[1])
    expect(within(screen.getByRole('tooltip')).getByText('2025')).toBeTruthy()
  })

  it('says so when the range has no games', () => {
    render(<WeekChart label="Empty" format={String} series={[]} />)
    expect(screen.getByText('No games in this range.')).toBeTruthy()
  })
})
