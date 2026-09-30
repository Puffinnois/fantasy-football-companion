import { describe, expect, it } from 'vitest'
import { fmtMarket } from '@/lib/tradeView'
import {
  ALL_POSITIONS,
  STREAM_CHIPS,
  STREAM_SHOWN,
  filterStream,
  isFree,
  noStreamers,
  optionLabel,
  priorityLine,
  releaseLabel,
  rosRankLabel,
  sortStash,
  startsText,
  streamOptionLabel,
  trendingNote,
  trendingText,
  weekOptionLabel
} from '@/lib/waiverView'
import {
  addOption,
  harris,
  stashRow,
  streamOption,
  streamRow,
  waiverAdds,
  wright
} from '../../fixtures/waiver'

describe('waiverView', () => {
  it('labels streaming options, weeks and empty chips', () => {
    expect(streamOptionLabel(streamOption({ net: -1.25 }))).toBe('Drop Kendre Miller · -1.25')
    expect(releaseLabel(streamOption({ release: { kind: 'open' }, releasePlayer: null }))).toBe(
      'Open spot'
    )
    expect(weekOptionLabel(3, 3)).toBe('Week 3 (this week)')
    expect(weekOptionLabel(5, 3)).toBe('Week 5')
    expect(noStreamers(5, ALL_POSITIONS)).toBe('No streamer beats your lineup in week 5.')
    expect(noStreamers(5, 'TE')).toBe('No TE streamer beats your lineup in week 5.')
    expect(STREAM_CHIPS).toEqual(['All', 'QB', 'RB', 'WR', 'TE', 'K', 'DEF'])
  })

  it('filters streamers by chip and caps the list', () => {
    const rows = [streamRow(), streamRow({ player: wright })]
    expect(filterStream(rows, ALL_POSITIONS).map((r) => r.player.playerId)).toEqual([
      harris.playerId,
      wright.playerId
    ])
    expect(filterStream(rows, 'RB').map((r) => r.player.playerId)).toEqual([wright.playerId])
    expect(filterStream(rows, 'TE')).toEqual([])
    expect(
      filterStream(
        Array.from({ length: 40 }, () => streamRow()),
        ALL_POSITIONS
      )
    ).toHaveLength(STREAM_SHOWN)
  })

  it('labels each release kind', () => {
    expect(releaseLabel(addOption())).toBe('Drop Kendre Miller')
    expect(releaseLabel(addOption({ release: { kind: 'open' }, releasePlayer: null }))).toBe(
      'Open spot'
    )
    expect(releaseLabel(addOption({ release: { kind: 'ir', playerId: '7002' } }))).toBe(
      'IR: Kendre Miller'
    )
    expect(optionLabel(addOption({ delta: -1.5 }))).toBe('Drop Kendre Miller · -1.50')
  })

  it('shows up to three start weeks, then a count', () => {
    expect(startsText([], 15)).toBe('—')
    expect(startsText([7, 9], 15)).toBe('wk 7, 9')
    expect(startsText([3, 4, 5, 6], 15)).toBe('4 of 15 wks')
  })

  it('shows my waiver priority in priority leagues only', () => {
    expect(priorityLine(waiverAdds())).toBe('Waiver priority 12 of 16')
    expect(priorityLine(waiverAdds({ waiverType: 'faab' }))).toBeNull()
    expect(priorityLine(waiverAdds({ myWaiverPosition: null }))).toBeNull()
  })

  it('formats the stash signals', () => {
    expect(rosRankLabel(wright)).toBe('RB34')
    expect(rosRankLabel(harris)).toBe('—')
    expect(trendingText(12345)).toBe(`+${fmtMarket(12345)}`)
    expect(trendingText(null)).toBe('—')
    expect(isFree(addOption({ delta: 0 }))).toBe(true)
    expect(isFree(addOption({ delta: -0.2 }))).toBe(false)
  })

  it('says when trending adds were fetched', () => {
    const now = Date.parse('2026-09-22T12:00:00.000Z')
    expect(trendingNote('2026-09-22T10:00:00.000Z', now)).toBe('Trending adds fetched 2 h ago')
    expect(trendingNote(null, now)).toBe('Trending adds unavailable — refresh to fetch them')
  })

  it('sorts the stash by a signal, players without it last', () => {
    const rows = [stashRow(), stashRow({ player: harris, trending: 1200 })]
    expect(sortStash(rows, 'market').map((r) => r.player.fullName)).toEqual([
      'Jaylen Wright',
      'Tre Harris'
    ])
    expect(sortStash(rows, 'trending').map((r) => r.player.fullName)).toEqual([
      'Tre Harris',
      'Jaylen Wright'
    ])
    expect(sortStash(rows, 'rank').map((r) => r.player.fullName)).toEqual([
      'Jaylen Wright',
      'Tre Harris'
    ])
  })
})
