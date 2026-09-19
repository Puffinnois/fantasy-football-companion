import type { FpRawResponse } from '@main/sources/fantasypros'

/** Weekly FLX page; `rank_*` come as strings in this capture. */
export const weeklyFlx: FpRawResponse = {
  count: 3,
  total_experts: 153,
  players: [
    {
      player_id: 17240,
      player_name: 'Saquon Barkley',
      player_team_id: 'PHI',
      player_position_id: 'RB',
      rank_ecr: 1,
      rank_min: '1',
      rank_max: '3',
      rank_ave: '1.4',
      rank_std: '0.6',
      pos_rank: 'RB1',
      start_sit_grade: 'A+',
      r2p_pts: '22.4'
    },
    {
      player_id: 19236,
      player_name: 'Justin Jefferson',
      player_team_id: 'MIN',
      player_position_id: 'WR',
      rank_ecr: 2,
      rank_min: 1,
      rank_max: 5,
      rank_ave: 2.1,
      rank_std: 1.2,
      pos_rank: 'WR1',
      start_sit_grade: 'A',
      r2p_pts: 19.8
    },
    {
      player_id: 30001,
      player_name: 'James Cook',
      player_team_id: 'BUF',
      player_position_id: 'RB',
      rank_ecr: 9,
      rank_ave: '8.7',
      rank_std: '2.3',
      pos_rank: 'RB5',
      start_sit_grade: 'B+',
      r2p_pts: 15.1
    }
  ]
}

export const weeklyQb: FpRawResponse = {
  count: 1,
  total_experts: 120,
  players: [
    {
      player_id: 30005,
      player_name: 'Retired Guy',
      player_team_id: null,
      player_position_id: 'QB',
      rank_ecr: 4,
      rank_ave: 4.2,
      rank_std: 1.1,
      pos_rank: 'QB4',
      start_sit_grade: 'B',
      r2p_pts: 18
    }
  ]
}

export const weeklyK: FpRawResponse = {
  count: 1,
  total_experts: 40,
  players: [
    {
      player_id: 30004,
      player_name: 'Jake Elliott',
      player_team_id: 'PHI',
      player_position_id: 'K',
      rank_ecr: 1,
      rank_ave: 1.5,
      rank_std: 0.8,
      pos_rank: 'K1',
      start_sit_grade: 'A',
      r2p_pts: 9
    }
  ]
}

/** DST rows carry team-level ids; FantasyPros spells Jacksonville `JAC`, Sleeper `JAX`. */
export const weeklyDst: FpRawResponse = {
  count: 2,
  total_experts: 60,
  players: [
    {
      player_id: 8250,
      player_name: 'Los Angeles Rams',
      player_team_id: 'LAR',
      player_position_id: 'DST',
      rank_ecr: 3,
      rank_ave: 3.4,
      rank_std: 1.9,
      pos_rank: 'DST3',
      start_sit_grade: 'A-',
      r2p_pts: 8.5
    },
    {
      player_id: 8240,
      player_name: 'Jacksonville Jaguars',
      player_team_id: 'JAC',
      player_position_id: 'DST',
      rank_ecr: 12,
      rank_ave: '12.5',
      rank_std: '3.1',
      pos_rank: 'DST12',
      start_sit_grade: 'C',
      r2p_pts: 6.2
    }
  ]
}

/** What the current week looks like before FantasyPros publishes it. */
export const unpublished: FpRawResponse = { count: 0, total_experts: 0, players: [] }

/**
 * ROS `position=ALL`: all six positions. Kelce and Elliott have no crosswalk id and no Sleeper
 * player of that name in the fixture (unmatched); "No Rank" has no usable rank (skipped).
 */
export const rosAll: FpRawResponse = {
  count: 9,
  total_experts: 6,
  players: [
    {
      player_id: 17240,
      player_name: 'Saquon Barkley',
      player_team_id: 'PHI',
      player_position_id: 'RB',
      rank_ecr: 1,
      rank_min: 1,
      rank_max: 2,
      rank_ave: 1.2,
      rank_std: 0.5,
      pos_rank: 'RB1'
    },
    {
      player_id: 19236,
      player_name: 'Justin Jefferson',
      player_team_id: 'MIN',
      player_position_id: 'WR',
      rank_ecr: 2,
      rank_ave: 2.5,
      rank_std: 1,
      pos_rank: 'WR1'
    },
    {
      player_id: 30001,
      player_name: 'James Cook',
      player_team_id: 'BUF',
      player_position_id: 'RB',
      rank_ecr: 12,
      rank_ave: '12.8',
      rank_std: '3.2',
      pos_rank: 'RB5'
    },
    {
      player_id: 30003,
      player_name: 'Travis Kelce',
      player_team_id: 'KC',
      player_position_id: 'TE',
      rank_ecr: 20,
      rank_ave: 21,
      rank_std: 4,
      pos_rank: 'TE1'
    },
    {
      player_id: 30005,
      player_name: 'Retired Guy',
      player_team_id: null,
      player_position_id: 'QB',
      rank_ecr: 40,
      rank_ave: 41,
      rank_std: 6,
      pos_rank: 'QB4'
    },
    {
      player_id: 8250,
      player_name: 'Los Angeles Rams',
      player_team_id: 'LAR',
      player_position_id: 'DST',
      rank_ecr: 140,
      rank_ave: 141,
      rank_std: 8,
      pos_rank: 'DST3'
    },
    {
      player_id: 30004,
      player_name: 'Jake Elliott',
      player_team_id: 'PHI',
      player_position_id: 'K',
      rank_ecr: 150,
      rank_ave: 152,
      rank_std: 9,
      pos_rank: 'K1'
    },
    {
      player_id: 8240,
      player_name: 'Jacksonville Jaguars',
      player_team_id: 'JAC',
      player_position_id: 'DST',
      rank_ecr: 160,
      rank_ave: 161,
      pos_rank: 'DST12'
    },
    {
      player_id: 30009,
      player_name: 'No Rank',
      player_team_id: 'NYJ',
      player_position_id: 'WR',
      rank_ecr: 'n/a',
      pos_rank: null
    }
  ]
}
