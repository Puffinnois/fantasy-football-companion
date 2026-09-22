import { describe, expect, it } from 'vitest'
import type { ExpertRankRow } from '@main/db/repos/expertRanks'
import type { PlayerSeries, SeriesWeek } from '@main/value/series'
import { applyRosRealism, shelved } from '@main/value/realism'

const CURRENT = 3

function week(w: number, projected: number | null, over: Partial<SeriesWeek> = {}): SeriesWeek {
  return {
    week: w,
    opponent: 'DAL',
    played: w < CURRENT,
    points: null,
    projected,
    line: {},
    snapPct: null,
    targetShare: null,
    rushShare: null,
    airYardsShare: null,
    wopr: null,
    ...over
  }
}

/** A player with the same projection in weeks 3–6; week 3 is the current week. */
function player(
  id: string,
  position: string | null,
  perWeek: number | null,
  over: { injuryStatus?: string | null; status?: string | null; weeks?: SeriesWeek[] } = {}
): PlayerSeries {
  return {
    base: {
      playerId: id,
      fullName: `Player ${id}`,
      position,
      team: 'PHI',
      byeWeek: null,
      injuryStatus: over.injuryStatus ?? null,
      status: over.status ?? 'Active',
      injuryBodyPart: null,
      injuryNotes: null,
      rookie: false,
      watched: false,
      ownerRosterId: null,
      ownerName: null,
      ownerIsMe: false
    },
    statsAvailable: true,
    rosterSlot: null,
    weeks: over.weeks ?? [3, 4, 5, 6].map((w) => week(w, perWeek))
  }
}

function rank(id: string, posRank: number): [string, ExpertRankRow] {
  return [
    id,
    {
      playerId: id,
      rankEcr: posRank,
      posRank,
      rankAve: null,
      rankStd: null,
      rankMin: null,
      rankMax: null,
      experts: 10,
      grade: null,
      projPts: null,
      scoring: 'PPR',
      updatedAt: '2026-09-22T00:00:00.000Z'
    }
  ]
}

/** Σ of the weeks the correction may touch: unplayed and after the current week. */
const future = (s: PlayerSeries): number =>
  s.weeks.filter((w) => !w.played && w.week > CURRENT).reduce((t, w) => t + (w.projected ?? 0), 0)
const byId = (list: PlayerSeries[]): Map<string, PlayerSeries> =>
  new Map(list.map((s) => [s.base.playerId, s]))

describe('shelved (spec §3.1)', () => {
  const base = (
    injuryStatus: string | null,
    status: string | null
  ): Parameters<typeof shelved>[0] => ({
    injuryStatus,
    status
  })
  it.each([
    ['IR', 'Active', true],
    [null, 'Injured Reserve', true],
    ['PUP', 'Active', true],
    [null, 'Physically Unable to Perform', true],
    ['Out', 'Active', false],
    ['Doubtful', 'Active', false],
    ['Questionable', 'Active', false],
    ['Sus', 'Active', false],
    ['NA', 'Active', false],
    [null, 'Active', false],
    [null, null, false]
  ])('injury=%s status=%s → %s', (injury, status, expected) => {
    expect(shelved(base(injury, status))).toBe(expected)
  })
})

describe('applyRosRealism (spec §3.2)', () => {
  it('zeroes the weeks after the current one for a shelved player and leaves the rest alone', () => {
    const shelf = player('shelf', 'RB', 10, { injuryStatus: 'IR' })
    const { players, adjustments } = applyRosRealism([shelf], CURRENT, new Map())
    const out = byId(players).get('shelf')
    if (!out) throw new Error('missing')
    expect(out.weeks.map((w) => [w.week, w.projected])).toEqual([
      [3, 10], // the current week is never touched
      [4, 0],
      [5, 0],
      [6, 0]
    ])
    expect(adjustments.get('shelf')).toEqual({
      shelved: true,
      factor: null,
      projPosRank: null,
      expertPosRank: null
    })
  })

  it('never touches a played week', () => {
    const weeks = [week(2, 9, { played: true, points: 14 }), week(4, 10), week(5, 10)]
    const s = player('p', 'RB', null, { injuryStatus: 'IR', weeks })
    const { players } = applyRosRealism([s], CURRENT, new Map())
    expect(players[0].weeks[0]).toMatchObject({ week: 2, projected: 9, points: 14 })
  })

  it('reassigns the position ladder to the consensus order', () => {
    // projections say A(60) > B(40) > C(20); the consensus says C, A, B.
    const a = player('a', 'RB', 20)
    const b = player('b', 'RB', 13.3333)
    const c = player('c', 'RB', 6.6667)
    const ranks = new Map([rank('c', 1), rank('a', 2), rank('b', 3)])
    const { players, adjustments, adjusted } = applyRosRealism([a, b, c], CURRENT, ranks)
    expect(adjusted).toBe(true)
    const out = byId(players)
    const got = (id: string): number => Math.round(future(out.get(id) as PlayerSeries))
    expect([got('c'), got('a'), got('b')]).toEqual([60, 40, 20])
    expect(adjustments.get('c')).toMatchObject({ shelved: false, projPosRank: 3, expertPosRank: 1 })
    expect(adjustments.get('a')).toMatchObject({ projPosRank: 1, expertPosRank: 2 })
    // c was worth 20 and is now worth 60
    expect(adjustments.get('c')?.factor).toBeCloseTo(3, 4)
  })

  it('conserves the position total and is idempotent', () => {
    const list = [player('a', 'WR', 20), player('b', 'WR', 12), player('c', 'WR', 5)]
    const ranks = new Map([rank('b', 1), rank('c', 2), rank('a', 3)])
    const before = list.reduce((t, s) => t + future(s), 0)
    const once = applyRosRealism(list, CURRENT, ranks)
    expect(once.players.reduce((t, s) => t + future(s), 0)).toBeCloseTo(before, 4)
    const twice = applyRosRealism(once.players, CURRENT, ranks)
    expect(twice.players.map(future)).toEqual(once.players.map(future))
    for (const [id, adj] of twice.adjustments) expect([id, adj.factor]).toEqual([id, 1])
  })

  it('frees a shelved player’s rung for the players below him', () => {
    // A is shelved; the ladder is then B(40), C(20) handed to the consensus order C, B.
    const a = player('a', 'TE', 20, { injuryStatus: 'IR' })
    const b = player('b', 'TE', 13.3333)
    const c = player('c', 'TE', 6.6667)
    const ranks = new Map([rank('a', 1), rank('c', 2), rank('b', 3)])
    const { players } = applyRosRealism([a, b, c], CURRENT, ranks)
    const out = byId(players)
    expect(Math.round(future(out.get('a') as PlayerSeries))).toBe(0)
    expect(Math.round(future(out.get('c') as PlayerSeries))).toBe(40)
    expect(Math.round(future(out.get('b') as PlayerSeries))).toBe(20)
  })

  it('leaves unranked players and non-lineup positions untouched', () => {
    const ranked = player('r', 'RB', 10)
    const unranked = player('u', 'RB', 30)
    const fullback = player('f', 'FB', 25)
    const noPosition = player('n', null, 25)
    const ranks = new Map([rank('r', 1), rank('f', 1), rank('n', 1)])
    const { players } = applyRosRealism([ranked, unranked, fullback, noPosition], CURRENT, ranks)
    const out = byId(players)
    // r is the only ranked RB, so his own ladder value comes back unchanged
    expect(future(out.get('r') as PlayerSeries)).toBeCloseTo(30, 4)
    expect(future(out.get('u') as PlayerSeries)).toBeCloseTo(90, 4)
    expect(future(out.get('f') as PlayerSeries)).toBeCloseTo(75, 4)
    expect(future(out.get('n') as PlayerSeries)).toBeCloseTo(75, 4)
  })

  it('spreads the corrected total when a ranked player has nothing projected', () => {
    // b has no projections at all but the consensus ranks him first, so he takes a's ladder rung.
    const a = player('a', 'QB', 10)
    const b = player('b', 'QB', null, {
      weeks: [week(4, null), week(5, null), week(6, null, { opponent: null })]
    })
    const ranks = new Map([rank('b', 1), rank('a', 2)])
    const { players, adjustments } = applyRosRealism([a, b], CURRENT, ranks)
    const out = byId(players)
    expect(future(out.get('b') as PlayerSeries)).toBeCloseTo(30, 4)
    // spread over the two weeks with a game, not the bye
    expect((out.get('b') as PlayerSeries).weeks.map((w) => w.projected)).toEqual([15, 15, null])
    expect(future(out.get('a') as PlayerSeries)).toBeCloseTo(0, 4)
    expect(adjustments.get('b')?.factor).toBeNull()
  })

  it('does nothing without expert ranks, and reports it', () => {
    const list = [player('a', 'RB', 20), player('b', 'RB', 5)]
    const { players, adjusted, adjustments } = applyRosRealism(list, CURRENT, new Map())
    expect(adjusted).toBe(false)
    expect(players.map(future)).toEqual([60, 15])
    expect(adjustments.get('a')).toEqual({
      shelved: false,
      factor: null,
      projPosRank: null,
      expertPosRank: null
    })
  })

  it('is a no-op for a past season, where no week is ahead', () => {
    const past = player('a', 'RB', 10, {
      weeks: [week(17, 10, { played: true }), week(18, 10, { played: true })]
    })
    const { players } = applyRosRealism([past], 19, new Map([rank('a', 1)]))
    expect(players[0].weeks.map((w) => w.projected)).toEqual([10, 10])
  })
})
