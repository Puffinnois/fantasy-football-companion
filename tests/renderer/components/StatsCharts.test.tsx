// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { PercentileBar, StatSection } from '@/components/stats/StatLines'
import { WeekChart } from '@/components/stats/WeekChart'
import type { SectionView } from '@/lib/stats/team'
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
    expect(screen.getByLabelText('25th percentile')).toBeTruthy()
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

  it('says so when the range has no games', () => {
    render(<WeekChart label="Empty" format={String} series={[]} />)
    expect(screen.getByText('No games in this range.')).toBeTruthy()
  })
})
