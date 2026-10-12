import type { WhSeasonType } from '@main/db/repos/warehouse'
import { numOrNull, strOrNull } from '@main/sources/csv'
import { seasonTypeOf } from '@main/sources/warehouse/parse'

/** Columns a play-by-play file cannot do without; a missing one fails the step (spec §4.3). */
export const PBP_KEY_COLUMNS = ['game_id', 'season', 'week', 'season_type', 'play_type']

/** One play-by-play row, reduced to what the aggregation reads. nflverse names in the comments. */
export interface Play {
  gameId: string
  season: number
  seasonType: WhSeasonType
  week: number
  home: string | null
  away: string | null
  /** The team with the ball; on kickoffs nflverse makes it the receiving team. */
  posteam: string | null
  defteam: string | null
  playType: string | null
  /** A snap wiped out by a penalty (`play_type` = no_play): no family counts it, penalties aside. */
  noPlay: boolean
  /** A two-point try (`two_point_attempt`): only the team two-point counts read it. */
  twoPoint: boolean
  twoPointSuccess: boolean
  /** `yardline_100`: yards to the opponent's end zone at the snap. */
  yardline: number | null
  down: number | null
  goalToGo: boolean
  qtr: number | null
  /** `game_seconds_remaining`. */
  clock: number | null
  wp: number | null
  epa: number | null
  qbEpa: number | null
  airEpa: number | null
  yacEpa: number | null
  wpa: number | null
  success: boolean
  cpoe: number | null
  airYards: number | null
  yardsGained: number | null
  passingYards: number | null
  rushingYards: number | null
  receivingYards: number | null
  /** `yards_after_catch`. */
  yac: number | null
  /** `xyac_mean_yardage`. */
  xyac: number | null
  xpass: number | null
  passOe: number | null
  /** nflverse `pass`: a dropback, sacks and scrambles included. */
  pass: boolean
  /** nflverse `rush`: a designed run. */
  rush: boolean
  /** `qb_dropback`. */
  dropback: boolean
  kneel: boolean
  spike: boolean
  scramble: boolean
  passAttempt: boolean
  sack: boolean
  complete: boolean
  interception: boolean
  fumbleLost: boolean
  fumbleForced: boolean
  tackledForLoss: boolean
  passTd: boolean
  rushTd: boolean
  returnTd: boolean
  touchback: boolean
  firstDownRush: boolean
  firstDownPass: boolean
  thirdConverted: boolean
  fourthConverted: boolean
  fourthFailed: boolean
  shotgun: boolean
  noHuddle: boolean
  /** nflverse `special`: a special-teams play. */
  special: boolean
  penalty: boolean
  punt: boolean
  puntInside20: boolean
  puntFairCatch: boolean
  puntBlocked: boolean
  kickoff: boolean
  kickoffFairCatch: boolean
  /** `own_kickoff_recovery`: the kicking team got the ball back. */
  ownKickoffRecovery: boolean
  /** A kickoff whose description says "onside" (nflverse has no column for it). */
  onside: boolean
  fieldGoal: boolean
  extraPoint: boolean
  /** `pass_defense_1_player_id` is set. */
  passDefended: boolean
  /** `passer_id`: the dropback QB, scrambles included (`passer_player_id` is empty on scrambles). */
  passerId: string | null
  /** `passer_player_id`, for spikes. */
  passPlayerId: string | null
  rusherId: string | null
  receiverId: string | null
  kickerId: string | null
  punterId: string | null
  kickReturnerId: string | null
  puntReturnerId: string | null
  penaltyPlayerId: string | null
  tdPlayerId: string | null
  /** Solo, assist and with-assist tacklers. */
  tacklerIds: string[]
  runLocation: string | null
  runGap: string | null
  returnTeam: string | null
  returnYards: number | null
  penaltyTeam: string | null
  penaltyYards: number | null
  penaltyType: string | null
  /** `fixed_drive`. */
  drive: number | null
  driveResult: string | null
  /** `drive_time_of_possession` ("M:SS") in seconds. */
  driveSeconds: number | null
  driveFirstDowns: number | null
  driveScored: boolean
  /** `ydsnet`: net yards of the drive so far. */
  ydsnet: number | null
  /** `posteam_score` before the play, `posteam_score_post` after it. */
  score: number | null
  scorePost: number | null
}

const TACKLER_COLUMNS = [
  'solo_tackle_1_player_id',
  'solo_tackle_2_player_id',
  'assist_tackle_1_player_id',
  'assist_tackle_2_player_id',
  'assist_tackle_3_player_id',
  'assist_tackle_4_player_id',
  'tackle_with_assist_1_player_id',
  'tackle_with_assist_2_player_id'
]

/** Every column the reader reads, so a test can check them against the real file's header. */
export const PBP_COLUMNS = [
  ...PBP_KEY_COLUMNS,
  ...TACKLER_COLUMNS,
  ...'home_team away_team posteam defteam two_point_attempt two_point_conv_result yardline_100 down goal_to_go qtr game_seconds_remaining wp epa qb_epa air_epa yac_epa wpa success cpoe air_yards yards_gained passing_yards rushing_yards receiving_yards yards_after_catch xyac_mean_yardage xpass pass_oe pass rush qb_dropback qb_kneel qb_spike qb_scramble pass_attempt sack complete_pass interception fumble_lost fumble_forced tackled_for_loss pass_touchdown rush_touchdown return_touchdown touchback first_down_rush first_down_pass third_down_converted fourth_down_converted fourth_down_failed shotgun no_huddle special penalty punt_attempt punt_inside_twenty punt_fair_catch punt_blocked kickoff_attempt kickoff_fair_catch own_kickoff_recovery desc field_goal_attempt extra_point_attempt pass_defense_1_player_id passer_id passer_player_id rusher_player_id receiver_player_id kicker_player_id punter_player_id kickoff_returner_player_id punt_returner_player_id penalty_player_id td_player_id run_location run_gap return_team return_yards penalty_team penalty_yards penalty_type fixed_drive fixed_drive_result drive_time_of_possession drive_first_downs drive_ended_with_score ydsnet posteam_score posteam_score_post play_deleted'.split(
    ' '
  )
]

/** "M:SS" → seconds. */
function minutesSeconds(raw: string): number | null {
  const m = /^(\d+):(\d{2})$/.exec(raw)
  return m ? Number(m[1]) * 60 + Number(m[2]) : null
}

/**
 * A reader for files with this header. It returns the play, null for a row left out on purpose
 * (deleted, preseason) or 'skip' for a row missing its game, season or week (counted).
 */
export function playReader(header: string[]): (fields: string[]) => Play | null | 'skip' {
  const index = new Map(header.map((column, i) => [column, i]))
  return (fields) => {
    const raw = (column: string): string => {
      const i = index.get(column)
      return i === undefined ? '' : (fields[i] ?? '')
    }
    const text = (column: string): string | null => strOrNull(raw(column))
    const num = (column: string): number | null => numOrNull(raw(column))
    const flag = (column: string): boolean => raw(column) === '1'

    if (flag('play_deleted')) return null
    const season = num('season')
    const week = num('week')
    const gameId = text('game_id')
    if (season === null || week === null || gameId === null) return 'skip'
    const seasonType = seasonTypeOf(raw('season_type'))
    if (seasonType === null) return null
    const playType = text('play_type')
    const kickoff = flag('kickoff_attempt')
    return {
      gameId,
      season,
      seasonType,
      week,
      home: text('home_team'),
      away: text('away_team'),
      posteam: text('posteam'),
      defteam: text('defteam'),
      playType,
      noPlay: playType === 'no_play',
      twoPoint: flag('two_point_attempt'),
      twoPointSuccess: raw('two_point_conv_result') === 'success',
      yardline: num('yardline_100'),
      down: num('down'),
      goalToGo: flag('goal_to_go'),
      qtr: num('qtr'),
      clock: num('game_seconds_remaining'),
      wp: num('wp'),
      epa: num('epa'),
      qbEpa: num('qb_epa'),
      airEpa: num('air_epa'),
      yacEpa: num('yac_epa'),
      wpa: num('wpa'),
      success: flag('success'),
      cpoe: num('cpoe'),
      airYards: num('air_yards'),
      yardsGained: num('yards_gained'),
      passingYards: num('passing_yards'),
      rushingYards: num('rushing_yards'),
      receivingYards: num('receiving_yards'),
      yac: num('yards_after_catch'),
      xyac: num('xyac_mean_yardage'),
      xpass: num('xpass'),
      passOe: num('pass_oe'),
      pass: flag('pass'),
      rush: flag('rush'),
      dropback: flag('qb_dropback'),
      kneel: flag('qb_kneel'),
      spike: flag('qb_spike'),
      scramble: flag('qb_scramble'),
      passAttempt: flag('pass_attempt'),
      sack: flag('sack'),
      complete: flag('complete_pass'),
      interception: flag('interception'),
      fumbleLost: flag('fumble_lost'),
      fumbleForced: flag('fumble_forced'),
      tackledForLoss: flag('tackled_for_loss'),
      passTd: flag('pass_touchdown'),
      rushTd: flag('rush_touchdown'),
      returnTd: flag('return_touchdown'),
      touchback: flag('touchback'),
      firstDownRush: flag('first_down_rush'),
      firstDownPass: flag('first_down_pass'),
      thirdConverted: flag('third_down_converted'),
      fourthConverted: flag('fourth_down_converted'),
      fourthFailed: flag('fourth_down_failed'),
      shotgun: flag('shotgun'),
      noHuddle: flag('no_huddle'),
      special: flag('special'),
      penalty: flag('penalty'),
      punt: flag('punt_attempt'),
      puntInside20: flag('punt_inside_twenty'),
      puntFairCatch: flag('punt_fair_catch'),
      puntBlocked: flag('punt_blocked'),
      kickoff,
      kickoffFairCatch: flag('kickoff_fair_catch'),
      ownKickoffRecovery: flag('own_kickoff_recovery'),
      onside: kickoff && /onside/i.test(raw('desc')),
      fieldGoal: flag('field_goal_attempt'),
      extraPoint: flag('extra_point_attempt'),
      passDefended: text('pass_defense_1_player_id') !== null,
      passerId: text('passer_id'),
      passPlayerId: text('passer_player_id'),
      rusherId: text('rusher_player_id'),
      receiverId: text('receiver_player_id'),
      kickerId: text('kicker_player_id'),
      punterId: text('punter_player_id'),
      kickReturnerId: text('kickoff_returner_player_id'),
      puntReturnerId: text('punt_returner_player_id'),
      penaltyPlayerId: text('penalty_player_id'),
      tdPlayerId: text('td_player_id'),
      tacklerIds: TACKLER_COLUMNS.map(text).filter((id): id is string => id !== null),
      runLocation: text('run_location'),
      runGap: text('run_gap'),
      returnTeam: text('return_team'),
      returnYards: num('return_yards'),
      penaltyTeam: text('penalty_team'),
      penaltyYards: num('penalty_yards'),
      penaltyType: text('penalty_type'),
      drive: num('fixed_drive'),
      driveResult: text('fixed_drive_result'),
      driveSeconds: minutesSeconds(raw('drive_time_of_possession')),
      driveFirstDowns: num('drive_first_downs'),
      driveScored: flag('drive_ended_with_score'),
      ydsnet: num('ydsnet'),
      score: num('posteam_score'),
      scorePost: num('posteam_score_post')
    }
  }
}

/** What a warehouse row needs of a play: its week and the game's two teams. */
export type GameWeek = Pick<Play, 'season' | 'seasonType' | 'week' | 'home' | 'away'>

/** The other team of the play's game; null when `team` is neither side. */
export function opponentOf(p: GameWeek, team: string | null): string | null {
  if (team === null) return null
  return team === p.home ? p.away : team === p.away ? p.home : null
}

/** A scrimmage snap that counts: a dropback or a run, not wiped out by a penalty, not a two-point try. */
export function isScrimmage(play: Play): boolean {
  return (play.pass || play.rush) && !play.noPlay && !play.twoPoint
}

/** Any play a family counts: not wiped out by a penalty, not a two-point try. */
export function counts(play: Play): boolean {
  return !play.noPlay && !play.twoPoint
}
