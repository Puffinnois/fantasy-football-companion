import { describe, expect, it } from 'vitest'
import { SLEEPER_STATS_URL, sleeperWeeks, slimWeek } from '@main/stats/sleeper'
import { openTestDb } from '../../fixtures/stats'
import { runSync } from '../../fixtures/statsSync'

const week = (n: number, type = 'regular'): string =>
  `${SLEEPER_STATS_URL}/2026/${n}?season_type=${type}`

describe('sleeperWeeks', () => {
  it('lists a past season in full and the current one through the state week', () => {
    const past = sleeperWeeks(2020, { season: 2026, week: 6, seasonType: 'regular' })
    expect(past).toHaveLength(17 + 4)
    expect(past.at(-1)).toEqual({ seasonType: 'post', week: 4 })
    expect(sleeperWeeks(2026, { season: 2026, week: 6, seasonType: 'regular' })).toHaveLength(6)
    expect(sleeperWeeks(2026, { season: 2026, week: 0, seasonType: 'pre' })).toEqual([])
    expect(sleeperWeeks(2026, { season: 2026, week: 2, seasonType: 'post' })).toHaveLength(22)
  })
})

describe('slimWeek', () => {
  it('keeps the ids, the context and the numeric stats under plain keys; counts rows without an id', () => {
    const out = slimWeek(
      [
        {
          player_id: '4866',
          team: 'NYG',
          opponent: 'DAL',
          game_id: 'g1',
          stats: { rush_yd: 80, pts_ppr: 14, note: 'x', "bad'key": 1 },
          player: { first_name: 'Saquon', last_name: 'Barkley', position: 'RB' }
        },
        { stats: { rush_yd: 1 } }
      ],
      { seasonType: 'post', week: 2 }
    )
    expect(out.skipped).toBe(1)
    expect(out.rows).toEqual([
      {
        player_id: '4866',
        team: 'NYG',
        opponent: 'DAL',
        game_id: 'g1',
        season_type: 'POST',
        week: 2,
        stats: { rush_yd: 80, pts_ppr: 14 }
      }
    ])
    expect(out.players[0]).toMatchObject({ first_name: 'Saquon', position: 'RB' })
  })
})

describe('Sleeper weekly lines (stats-analysis spec §4.1)', () => {
  it('splits players, defenses and team offense, every stat key a column', async () => {
    const db = await openTestDb()
    const { steps } = await runSync(db, {
      only: ['sleeper'],
      json: {
        [week(1)]: [
          {
            player_id: '4866',
            team: 'NYG',
            opponent: 'LAR',
            stats: { rush_yd: 80 },
            player: { first_name: 'Saquon', last_name: 'Barkley', position: 'RB' }
          },
          { player_id: 'LAR', team: 'LAR', opponent: 'NYG', stats: { pts_allow: 24 } },
          // Sleeper's oldest player ids are 1–3 digits; they are players, not defenses.
          { player_id: '96', team: 'NYJ', opponent: 'BUF', stats: { pass_yd: 210 } },
          { player_id: 'TEAM_NYG', team: 'NYG', opponent: 'LAR', stats: { pass_att: 30 } }
        ],
        [week(2)]: [{ player_id: '4866', team: 'NYG', opponent: 'DAL', stats: { rec: 3 } }]
      }
    })
    expect(steps.find((s) => s.source === 'stats:sleeper:2026')).toMatchObject({ status: 'ok' })
    expect(
      await db.all(
        "SELECT week, player_id, team, opponent, rush_yd, rec FROM src_sleeper WHERE player_id = '4866' ORDER BY week"
      )
    ).toEqual([
      { week: 1, player_id: '4866', team: 'NYG', opponent: 'LA', rush_yd: 80, rec: null },
      { week: 2, player_id: '4866', team: 'NYG', opponent: 'DAL', rush_yd: null, rec: 3 }
    ])
    expect(
      await db.all("SELECT player_id, pass_yd FROM src_sleeper WHERE player_id = '96'")
    ).toEqual([{ player_id: '96', pass_yd: 210 }])
    expect(await db.all('SELECT player_id, team, pts_allow FROM src_sleeper_def')).toEqual([
      { player_id: 'LAR', team: 'LA', pts_allow: 24 }
    ])
    expect(await db.all('SELECT player_id, pass_att FROM src_sleeper_team')).toEqual([
      { player_id: 'TEAM_NYG', pass_att: 30 }
    ])
    expect(await db.all('SELECT player_id, first_name, position FROM src_sleeper_players')).toEqual(
      [{ player_id: '4866', first_name: 'Saquon', position: 'RB' }]
    )
  })

  it('skips a season with no lines yet', async () => {
    const db = await openTestDb()
    const { steps } = await runSync(db, { only: ['sleeper'] })
    expect(steps.find((s) => s.source === 'stats:sleeper:2026')).toMatchObject({
      status: 'skipped',
      message: '2026 has not started'
    })
  })
})
