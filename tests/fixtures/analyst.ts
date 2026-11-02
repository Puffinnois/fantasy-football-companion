import type { Person } from '@shared/stats/types'

const person = (id: string, name: string, over: Partial<Person> = {}): Person => {
  const [first, ...rest] = name.split(' ')
  return {
    id,
    name,
    firstName: first,
    lastName: rest.join(' '),
    position: 'WR',
    team: 'BUF',
    firstSeason: 2019,
    lastSeason: 2026,
    games: 60,
    recentGames: 20,
    recentPoints: 200,
    ...over
  }
}

/** A small player index: namesakes, short forms, everyday surnames, a retired player. */
export const PEOPLE: Person[] = [
  person('00-0034796', 'Lamar Jackson', { position: 'QB', team: 'BAL', recentPoints: 600 }),
  person('00-0037000', 'Lamar Jackson', {
    position: 'DB',
    team: 'CHI',
    recentPoints: 0,
    games: 3,
    recentGames: 3
  }),
  person('00-0036322', 'Justin Jefferson', { position: 'WR', team: 'MIN', recentPoints: 400 }),
  person('00-0041075', 'Justin Jefferson', {
    position: 'LB',
    team: 'CLE',
    recentPoints: 0,
    recentGames: 7
  }),
  person('00-0038542', 'Bijan Robinson', { position: 'RB', team: 'ATL', recentPoints: 500 }),
  person('00-0039139', 'Jahmyr Gibbs', { position: 'RB', team: 'DET', recentPoints: 480 }),
  person('00-0033280', 'Christian McCaffrey', { position: 'RB', team: 'SF', recentPoints: 300 }),
  person('00-0039075', 'Puka Nacua', { position: 'WR', team: 'LA', recentPoints: 350 }),
  person('00-0038543', 'Jaxon Smith-Njigba', { position: 'WR', team: 'SEA', recentPoints: 360 }),
  person('00-0034857', 'Josh Allen', { position: 'QB', team: 'BUF', recentPoints: 650 }),
  person('00-0029000', 'Zach Line', {
    position: 'RB',
    team: 'NO',
    lastSeason: 2019,
    recentGames: 0,
    recentPoints: 0
  }),
  person('00-0037200', 'Chase Brown', { position: 'RB', team: 'CIN', recentPoints: 250 }),
  person('00-0036900', "Ja'Marr Chase", { position: 'WR', team: 'CIN', recentPoints: 420 }),
  person('00-0037750', 'Mike Williams', { position: 'WR', team: 'PIT', recentPoints: 60 }),
  person('00-0037751', 'Mike Williams', {
    position: 'LB',
    team: 'NYG',
    recentPoints: 0,
    recentGames: 9
  }),
  person('00-0031000', 'Jordan Love', { position: 'QB', team: 'GB', recentPoints: 380 }),
  person('00-0032000', 'Chris Jones', {
    position: 'DL',
    team: 'KC',
    games: 100,
    recentPoints: 0
  }),
  person('00-0032001', 'Chris Jones', { position: 'DB', team: 'ARI', games: 30, recentPoints: 0 })
]

export const NOW = { season: 2026, week: 7, seasonType: 'REG' as const }
