import { describe, expect, it } from 'vitest'
import { classify } from '@main/analyst/classify'
import { lexicalRetriever } from '@main/analyst/metrics'
import { playerIndex, positionsIn } from '@main/analyst/players'
import { contextText, resolve } from '@main/analyst/resolve'
import { detectSlots } from '@main/analyst/slots'
import { findTeams } from '@main/analyst/teams'
import { distance, words } from '@main/analyst/text'
import { resolveTime } from '@main/analyst/time'
import { NOW, PEOPLE } from '../../fixtures/analyst'

const index = playerIndex(PEOPLE)
const ids = (q: string, hints = {}): string[][] =>
  index.find(q, hints).map((m) => m.people.map((p) => p.id))

describe('the resolver’s text (Ask spec §4.1)', () => {
  it('splits words, keeping how they were written', () => {
    expect(words("Ja'Marr Chase's YPRR, since week 5")).toEqual([
      { raw: "Ja'Marr", key: 'jamarr' },
      { raw: 'Chase', key: 'chase' },
      { raw: 'YPRR', key: 'yprr' },
      { raw: 'since', key: 'since' },
      { raw: 'week', key: 'week' },
      { raw: '5', key: '5' }
    ])
  })

  it('measures spelling distance, transpositions as one', () => {
    expect(distance('mccaffery', 'mccaffrey', 2)).toBe(1)
    expect(distance('steelers', 'steele', 2)).toBe(2)
    expect(distance('abcdef', 'uvwxyz', 2)).toBe(3)
  })
})

describe('teams', () => {
  it('reads names, nicknames, slang and codes in capitals; an opponent after vs or against', () => {
    expect(findTeams('Who do the Niners play next week?')).toEqual([
      { code: 'SF', mention: 'Niners', role: 'subject' }
    ])
    expect(findTeams('RB yards against the Ravens').map((t) => [t.code, t.role])).toEqual([
      ['BAL', 'opponent']
    ])
    expect(findTeams('How do the Chiefs play against NO?').map((t) => [t.code, t.role])).toEqual([
      ['KC', 'subject'],
      ['NO', 'opponent']
    ])
    // Two teams around "vs" are both the subject of a comparison.
    expect(findTeams('Bills vs Chiefs: playoff odds').map((t) => [t.code, t.role])).toEqual([
      ['BUF', 'subject'],
      ['KC', 'subject']
    ])
    // "no" and "la" in a sentence are words; Los Angeles needs the nickname.
    expect(findTeams('no one in los angeles')).toEqual([])
  })
})

describe('players', () => {
  it('reads full names, short forms and a distinctive first name', () => {
    expect(ids('Christian McCaffrey yards after contact')).toEqual([['00-0033280']])
    expect(ids('cmc rushing yards')).toEqual([['00-0033280']])
    expect(ids('Puka or JSN?')).toEqual([['00-0039075'], ['00-0038543']])
    expect(ids('bijan vs gibbs')).toEqual([['00-0038542'], ['00-0039139']])
  })

  it('tells namesakes apart by position, then by who has played lately', () => {
    // The quarterback has points; the cornerback has none.
    expect(ids('Lamar Jackson rushing yards')).toEqual([['00-0034796']])
    expect(ids('Lamar Jackson tackles', { positions: ['DB'] })).toEqual([['00-0037000']])
    // Both Justin Jeffersons played lately; the receiver has the points.
    expect(ids('Justin Jefferson catch rate')).toEqual([['00-0036322']])
    // The receiver scored fantasy points; the linebacker none.
    expect(ids('Mike Williams targets')).toEqual([['00-0037750']])
    // Neither Chris Jones clearly leads: the question goes back.
    expect(ids('Chris Jones sacks')).toEqual([['00-0032000', '00-0032001']])
  })

  it('takes a surname in capitals, not an everyday or football word in lower case', () => {
    expect(ids('How is Love doing')).toEqual([['00-0031000']])
    expect(ids('goal line work: most carries inside the 5')).toEqual([])
    expect(ids('Chase Brown carries in the red zone')).toEqual([['00-0037200']])
  })

  it('reads a name one or two letters off, and never a team word', () => {
    expect(ids('Christian McCaffery yards after contact')).toEqual([['00-0033280']])
    expect(ids('How did Lamar Jackson do against the Steelers', { exclude: ['Steelers'] })).toEqual(
      [['00-0034796']]
    )
  })

  it('reads position words, not one after "on the" or "against"', () => {
    expect(positionsIn('best TE by target share')).toEqual(['TE'])
    expect(positionsIn('who generates the most pressure on the quarterback')).toEqual([])
    expect(positionsIn('receivers vs man')).toEqual(['WR', 'TE', 'RB'])
    expect(positionsIn('is he due to bounce back')).toEqual([])
  })
})

describe('time', () => {
  const t = (q: string): ReturnType<typeof resolveTime> => resolveTime(q, NOW)
  it('resolves seasons, weeks and games against now', () => {
    expect(t('this season')).toMatchObject({ seasons: [2026], said: ["'this season' = 2026"] })
    expect(t('last year')).toMatchObject({ seasons: [2025] })
    expect(t('since week 5')).toMatchObject({ seasons: [2026], weeks: [5, 7] })
    expect(t('over the last 3 weeks')).toMatchObject({ weeks: [5, 7] })
    expect(t('his last four games')).toMatchObject({ lastNGames: 4, seasons: [2026] })
    expect(t('weeks 3-6 of 2025')).toMatchObject({ seasons: [2025], weeks: [3, 6] })
    expect(t('from 2022 to 24')).toMatchObject({ seasons: [2022, 2023, 2024] })
    expect(t('since 2023')).toMatchObject({ seasons: [2023, 2024, 2025, 2026] })
    expect(t('last 3 seasons')).toMatchObject({ seasons: [2024, 2025, 2026] })
    expect(t('next week')).toMatchObject({ weeks: [8, 8] })
  })

  it('keeps a range, "since" and "last N seasons" inside 2019 to now, and says so', () => {
    expect(t('from 2017 to 2020')).toMatchObject({
      seasons: [2019, 2020],
      said: ["'from 2017 to 2020' = seasons 2019–2020 (the data starts in 2019)"]
    })
    expect(t('since 2017').seasons).toEqual([2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026])
    expect(t('last 10 seasons').seasons?.[0]).toBe(2019)
    expect(t('from 2010 to 2015').outOfRange).toBe(2010)
  })

  it('reads "and" as a list, and a number before yards or points as a number', () => {
    expect(t('2019 and 2021').seasons).toEqual([2019, 2021])
    expect(t('2022-24').seasons).toEqual([2022, 2023, 2024])
    expect(t('Who is on pace for 2000 rushing yards?')).toEqual({ said: [] })
  })

  it('reads the first weeks of a season as weeks', () => {
    expect(t('over the first 6 weeks')).toMatchObject({ seasons: [2026], weeks: [1, 6] })
    expect(detectSlots('over the first 6 weeks').limit).toBeNull()
  })

  it('reads the postseason, but not in playoff odds, and flags seasons out of range', () => {
    expect(t('in the playoffs').seasonType).toBe('POST')
    expect(t('best playoff odds').seasonType).toBeUndefined()
    expect(t('Barry Sanders in 1997').outOfRange).toBe(1997)
    expect(t('EPA by week 2025')).toMatchObject({ seasons: [2025] })
    expect(t('EPA by week 2025').weeks).toBeUndefined()
  })
})

describe('slots', () => {
  it('detects situations, but not one the metric itself names', () => {
    expect(detectSlots('Henry yards per carry in the red zone').flags).toEqual(['red_zone'])
    expect(detectSlots('most red-zone carries').flags).toEqual([])
    expect(detectSlots('Chase against man coverage').flags).toEqual(['man_coverage'])
    expect(detectSlots('which defenses blitz the most').flags).toEqual([])
    expect(detectSlots('completion rate when pressured on third down').flags).toEqual([
      'third_down',
      'pressure'
    ])
    // EPA under pressure is a metric of its own.
    expect(detectSlots('best EPA under pressure').flags).toEqual([])
  })

  it('detects groupings, rostered, a row count and the bottom of a ranking', () => {
    expect(detectSlots('Bijan game log').groupings).toEqual(['week'])
    expect(detectSlots('man vs zone splits for Garrett Wilson')).toMatchObject({
      groupings: ['coverage'],
      flags: []
    })
    expect(detectSlots('best free-agent TE').rostered).toBe('free')
    expect(detectSlots('targets on my team').rostered).toBe('mine')
    expect(detectSlots('worst 5 defenses')).toMatchObject({ limit: 5, end: 'worst' })
    expect(detectSlots('lowest passer rating allowed').end).toBe('low')
    expect(detectSlots('who has thrown the most interceptions').end).toBe('high')
    // "At least" is a threshold, not the low end.
    expect(detectSlots('best YPRR among WRs with at least 200 routes').end).toBeNull()
  })
})

describe('the question type', () => {
  const r = {
    players: 0,
    ambiguous: 0,
    teams: 0,
    opponents: 0,
    metricHint: true,
    outOfRange: false,
    rostered: null
  }
  it('declines advice and seasons out of range before anything else', () => {
    expect(classify('Should I start Bijan or Gibbs?', { ...r, players: 2 })).toBe('advice')
    expect(classify('Barry Sanders 1997', { ...r, outOfRange: true })).toBe('out_of_range')
  })

  it('picks a definition, games, league, outlook, compare, player, team or leaderboard', () => {
    expect(classify('What does WOPR mean?', r)).toBe('definition')
    expect(classify('What is Josh Allen’s EPA?', { ...r, players: 1 })).toBe('player')
    expect(classify('Who do the Niners play next week?', { ...r, teams: 1 })).toBe('games')
    expect(classify('which teams have the easiest remaining schedule', r)).toBe('leaderboard')
    expect(classify('Who owns Puka Nacua?', { ...r, players: 1 })).toBe('league')
    expect(classify('best free agent TE by target share', { ...r, rostered: 'free' })).toBe(
      'leaderboard'
    )
    expect(classify('Is Jordan Love due for regression?', { ...r, players: 1 })).toBe('outlook')
    expect(classify('Puka or JSN?', { ...r, players: 2 })).toBe('compare')
    expect(classify('Ravens and Bengals offenses', { ...r, teams: 2 })).toBe('compare')
    expect(classify('How good is the Ravens’ run defense', { ...r, teams: 1 })).toBe('team')
    expect(classify('which defenses rank best, Ravens included', { ...r, teams: 1 })).toBe(
      'leaderboard'
    )
    expect(classify('Who leads WRs in YPRR?', r)).toBe('leaderboard')
  })
})

describe('resolve (Ask spec §4.1)', () => {
  const deps = { people: index, now: NOW }

  it('builds the context block a model reads', () => {
    const b = resolve('How does Ja’Marr Chase do against man coverage this year?', deps)
    expect(b).toMatchObject({
      type: 'player',
      tool: 'player_stats',
      players: [{ id: '00-0036900', name: "Ja'Marr Chase", position: 'WR', team: 'CIN' }],
      time: { seasons: [2026] },
      slots: { flags: ['man_coverage'] },
      decline: null
    })
    expect(b.metrics.slice(0, 2).map((m) => m.id)).toEqual(['tprr_man', 'yprr_man'])
    const text = contextText(b)
    expect(text).toContain("- Player: Ja'Marr Chase = 00-0036900 (WR, CIN)")
    expect(text).toContain("- Time: 'this year' = 2026")
    expect(text).toContain('- Situations named: man_coverage')
    expect(text).toContain('  - tprr_man: TPRR vs man (player) — ')
  })

  it('asks back when a name matches several players, and declines advice', () => {
    const b = resolve('Chris Jones sacks this season', deps)
    expect(b.tool).toBeNull()
    expect(b.ambiguous[0].options.map((o) => o.position)).toEqual(['DL', 'DB'])
    expect(contextText(b)).toContain('"Chris Jones" matches several players: ')
    const a = resolve('Should I start Bijan or Gibbs this week?', deps)
    expect(a).toMatchObject({ type: 'advice', tool: null })
    expect(a.decline).toMatch(/does not give advice/)
  })

  it('keeps a full name that holds a team word a player, and the team word alone a team', () => {
    const b = resolve('How many targets does Malik Washington have this season?', deps)
    expect(b).toMatchObject({ type: 'player', tool: 'player_stats', teams: [] })
    expect(b.players.map((p) => p.id)).toEqual(['00-0040300'])
    expect(resolve('How good is Washington’s defense?', deps).teams.map((t) => t.code)).toEqual([
      'WAS'
    ])
  })

  it('separates an opponent from the subject team', () => {
    const b = resolve('Which RBs have the most yards against the Ravens since 2023?', deps)
    expect(b).toMatchObject({ type: 'leaderboard', teams: [], opponents: [{ code: 'BAL' }] })
  })
})

describe('metric candidates (Ask spec §4.1: recall@5 ≥ 95 %)', () => {
  // The probe's 40 phrasings (report P1), before which aliases did not exist.
  const PHRASINGS: [string, string[]][] = [
    ['who leads WRs in yards per route run since week 5?', ['yprr']],
    ['best YPRR among tight ends this year', ['yprr']],
    ['which receivers earn a target on the highest share of their routes', ['tprr']],
    ['TPRR leaders at TE', ['tprr']],
    ['who has the deepest aDOT among wide receivers', ['rec_adot']],
    ['how far downfield does Josh Allen throw on average', ['pass_adot']],
    ['QBs ranked by completion percentage over expected', ['cpoe']],
    ['who is the most accurate passer relative to expectation', ['cpoe']],
    ['RBs with the most rushing yards over expected per carry', ['ryoe_att', 'ryoe']],
    [
      'which running backs gain the most beyond what their blocking gives them',
      ['ryoe', 'ryoe_att']
    ],
    ['WOPR leaders', ['wopr']],
    ["who gets the biggest share of his team's targets", ['target_share']],
    ['air yards share top 10', ['air_yards_share']],
    ['best quarterback by EPA per dropback', ['qb_epa_db']],
    ['which QB gets sacked the most often', ['sack_rate', 'sacks_taken']],
    ['top edge rushers by sacks', ['sacks']],
    ['who generates the most pressure on the quarterback', ['pressures', 'pressure_rate']],
    ['cornerbacks with the lowest passer rating allowed', ['coverage_rating']],
    ['which teams pass more than expected', ['proe', 'neutral_proe']],
    ['which defenses blitz the most', ['def_blitz_rate']],
    ['playoff chances for every team', ['playoff_pct']],
    ['highest fantasy points per game among RBs', ['fantasy_ppg']],
    ['who scores the most PPG at tight end', ['fantasy_ppg']],
    ['expected fantasy points leaders', ['expected_points', 'expected_ppg']],
    ['which receivers have the most boom weeks', ['boom_rate']],
    ['on what share of dropbacks is Puka running a route', ['route_participation']],
    ['yards after contact per carry leaders', ['yac_att']],
    ['who plays the most snaps at RB', ['snap_share', 'off_snaps']],
    ['goal line work: most carries inside the 5', ['i5_carries', 'i10_carries']],
    ['red zone carries leaders', ['rz_carries']],
    ['best long-distance kicker', ['fg_pct_50p', 'fg_made_50p']],
    ['kickers ranked by field goals over expected', ['fgoe', 'fgoe_pct']],
    ['which teams have the easiest remaining schedule', ['sos_left_elo', 'sos_left_adj']],
    ['QBs who get rid of the ball fastest', ['time_to_throw']],
    ['which defenses play the most man coverage', ['def_man_rate']],
    ['who gets the most separation from defenders', ['separation']],
    ['high value touches for running backs', ['high_value_touches']],
    ['who drops the most catchable passes', ['drop_rate', 'drops']],
    ['which offenses play fastest in neutral situations', ['neutral_pace']],
    ['teams with the highest implied team total', ['implied_points']]
  ]

  it('puts the right metric in the top 5 for at least 95 % of the probe phrasings', () => {
    const misses = PHRASINGS.filter(([q, gold]) => {
      const top = resolve(q, { people: index, now: NOW }).metrics.map((m) => m.id)
      return !gold.some((g) => top.includes(g))
    })
    expect(misses.length / PHRASINGS.length).toBeLessThanOrEqual(0.05)
  })

  it('ranks aliases said whole above loose word matches', () => {
    const top = lexicalRetriever().rank('who gets rid of the ball fastest', 3)
    expect(top[0].id).toBe('time_to_throw')
  })
})
