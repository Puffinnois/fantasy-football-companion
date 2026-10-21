import { describe, expect, it } from 'vitest'
import { playerBio } from '@main/stats/engine/player'
import { openTestDb } from '../../../fixtures/stats'
import { seedTable, type Row } from '../../../fixtures/statsDerived'

const CHASE = '00-0036900'
const ADAMS = '00-0031381'
const RICE = '00-0039004'

async function seeded(): Promise<Awaited<ReturnType<typeof openTestDb>>> {
  const db = await openTestDb()
  const player = (gsis_id: string, name: string, over: Row = {}): Row => ({
    gsis_id,
    name,
    first_name: name.split(' ')[0],
    last_name: name.split(' ').slice(1).join(' '),
    position: 'WR',
    birth_date: '2000-03-01',
    height: 72,
    weight: 205,
    college: 'LSU',
    draft_year: 2021,
    draft_round: 1,
    draft_pick: 5,
    draft_team: 'CIN',
    rookie_season: 2021,
    team: 'CIN',
    sleeper_id: '7564',
    ...over
  })
  await seedTable(db, 'players', [
    player(CHASE, "Ja'Marr Chase"),
    player(ADAMS, 'Davante Adams', {
      draft_year: null,
      draft_round: null,
      draft_pick: null,
      team: 'LV',
      sleeper_id: null
    }),
    player(RICE, 'Rashee Rice', { team: 'KC' })
  ])
  const roster = (gsis_id: string, season: number, week: number, over: Row = {}): Row => ({
    gsis_id,
    season,
    week,
    team: 'CIN',
    jersey_number: 1,
    status: 'ACT',
    status_description_abbr: 'A01',
    ...over
  })
  await seedTable(db, 'src_rosters', [
    roster(CHASE, 2025, 18),
    roster(CHASE, 2026, 6),
    roster(CHASE, 2026, 7),
    // Adams went on injured reserve in week 7; Rice was suspended in 2025 and is back.
    roster(ADAMS, 2026, 7, {
      team: 'LA',
      jersey_number: 17,
      status: 'RES',
      status_description_abbr: 'R01'
    }),
    roster(RICE, 2025, 3, { team: 'KC', status: 'RES', status_description_abbr: 'R40' }),
    roster(RICE, 2026, 7, { team: 'KC' })
  ])
  const report = (gsis_id: string, season: number, week: number, over: Row = {}): Row => ({
    gsis_id,
    season,
    week,
    report_status: null,
    report_primary_injury: null,
    practice_primary_injury: 'Hamstring',
    practice_status: 'Limited Participation in Practice',
    ...over
  })
  await seedTable(db, 'src_injuries', [
    report(CHASE, 2026, 7, { report_status: 'Questionable', report_primary_injury: 'Ankle' }),
    // Last week's report is over.
    report(RICE, 2026, 6, { report_status: 'Out' })
  ])
  await seedTable(db, 'player_season', [
    { gsis_id: CHASE, season: 2021, games: 17 },
    { gsis_id: CHASE, season: 2026, games: 6 },
    { gsis_id: CHASE, season: 2024, games: 17 },
    { gsis_id: CHASE, season: 2025, games: 0 }
  ])
  return db
}

describe('a player’s identity and status (stats-analysis spec §9.4)', () => {
  it('reads the bio, the draft, his team and number now, the seasons he played', async () => {
    const bio = await playerBio(await seeded(), { player: CHASE })
    expect(bio).toMatchObject({
      id: CHASE,
      name: "Ja'Marr Chase",
      firstName: "Ja'Marr",
      lastName: 'Chase',
      position: 'WR',
      team: 'CIN',
      jersey: 1,
      birthDate: '2000-03-01',
      height: 72,
      weight: 205,
      college: 'LSU',
      draft: { year: 2021, round: 1, pick: 5, team: 'CIN' },
      rookieSeason: 2021,
      seasons: [2021, 2024, 2026],
      sleeperId: '7564'
    })
  })

  it('reports the latest week’s injury report, practice and game status', async () => {
    expect((await playerBio(await seeded(), { player: CHASE })).status).toEqual({
      season: 2026,
      week: 7,
      reserve: null,
      report: 'Questionable',
      practice: 'Limited',
      injury: 'Ankle'
    })
  })

  it('reports a reserve list from the latest roster week only', async () => {
    const db = await seeded()
    const adams = await playerBio(db, { player: ADAMS })
    expect(adams).toMatchObject({ team: 'LA', jersey: 17, draft: null, sleeperId: null })
    expect(adams.status).toMatchObject({ reserve: 'IR', report: null, week: 7 })
    // Suspended in 2025, healthy now; last week's "Out" is not this week's.
    expect((await playerBio(db, { player: RICE })).status).toBeNull()
  })

  it('refuses an id that is not a gsis id, and says when there is no such player', async () => {
    const db = await seeded()
    await expect(playerBio(db, { player: "x' OR 1=1" })).rejects.toThrow('gsis id')
    await expect(playerBio(db, { player: '00-0000000' })).rejects.toThrow('no player 00-0000000')
  })
})
