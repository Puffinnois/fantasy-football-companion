import { describe, expect, it } from 'vitest'
import type { ExpertRankRow } from '@main/db/repos/expertRanks'
import type { PlayerSeries, SeriesWeek } from '@main/value/series'
import { applyRosRealism, ROS_FACTOR_CAP, shelved } from '@main/value/realism'

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
      capped: false,
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
    // projections say A(60) > B(45) > C(40); the consensus says C, A, B.
    const a = player('a', 'RB', 20)
    const b = player('b', 'RB', 15)
    const c = player('c', 'RB', 13.3333)
    const ranks = new Map([rank('c', 1), rank('a', 2), rank('b', 3)])
    const { players, adjustments, adjusted } = applyRosRealism([a, b, c], CURRENT, ranks)
    expect(adjusted).toBe(true)
    const out = byId(players)
    const got = (id: string): number => Math.round(future(out.get(id) as PlayerSeries))
    expect([got('c'), got('a'), got('b')]).toEqual([60, 45, 40])
    expect(adjustments.get('c')).toMatchObject({
      shelved: false,
      capped: false,
      projPosRank: 3,
      expertPosRank: 1
    })
    expect(adjustments.get('a')).toMatchObject({ projPosRank: 1, expertPosRank: 2 })
    // c was worth 40 and is now worth 60
    expect(adjustments.get('c')?.factor).toBeCloseTo(1.5, 4)
  })

  it('caps the scale in both directions (a backup never inherits a starter’s season)', () => {
    // A one-week fill-in ranked above the starter he replaces: raw factors would be ×6 and ×1/6.
    const starter = player('s', 'QB', 20)
    const fillIn = player('f', 'QB', 3.3333)
    const ranks = new Map([rank('f', 1), rank('s', 2)])
    const { players, adjustments } = applyRosRealism([starter, fillIn], CURRENT, ranks)
    const out = byId(players)
    expect(future(out.get('f') as PlayerSeries)).toBeCloseTo(20, 3)
    expect(future(out.get('s') as PlayerSeries)).toBeCloseTo(30, 3)
    expect(adjustments.get('f')).toMatchObject({ factor: ROS_FACTOR_CAP, capped: true })
    expect(adjustments.get('s')).toMatchObject({ factor: 1 / ROS_FACTOR_CAP, capped: true })
  })

  it('conserves the position total within the cap and is idempotent', () => {
    const list = [player('a', 'WR', 20), player('b', 'WR', 18), player('c', 'WR', 15)]
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

  it('adds nothing to a ranked player with no projection after this week, and keeps him off the ladder', () => {
    // b is projected for the current week only (a one-week fill-in); the consensus ranks him first.
    const a = player('a', 'QB', 10)
    const b = player('b', 'QB', null, {
      weeks: [week(3, 18), week(4, null), week(5, null), week(6, null)]
    })
    const ranks = new Map([rank('b', 1), rank('a', 2)])
    const { players, adjustments } = applyRosRealism([a, b], CURRENT, ranks)
    const out = byId(players)
    expect((out.get('b') as PlayerSeries).weeks.map((w) => w.projected)).toEqual([
      18,
      null,
      null,
      null
    ])
    // a is the only player on the ladder, so he keeps his own rung
    expect(future(out.get('a') as PlayerSeries)).toBeCloseTo(30, 4)
    expect(adjustments.get('b')).toMatchObject({ factor: null, capped: false, expertPosRank: 1 })
  })

  it('does nothing without expert ranks, and reports it', () => {
    const list = [player('a', 'RB', 20), player('b', 'RB', 5)]
    const { players, adjusted, adjustments } = applyRosRealism(list, CURRENT, new Map())
    expect(adjusted).toBe(false)
    expect(players.map(future)).toEqual([60, 15])
    expect(adjustments.get('a')).toEqual({
      shelved: false,
      factor: null,
      capped: false,
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
