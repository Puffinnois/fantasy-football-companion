import type { WhPlayerWeek, WhTeamWeek } from '@main/db/repos/warehouse'
import { forEachCsvRow } from '@main/sources/csv'
import { requireColumns } from '@main/sources/warehouse/parse'
import { aggregateFtn } from './ftn'
import type { JoinResult } from './join'
import { aggregateParticipation } from './participation'
import { PlayerWeeks } from './pbpPlayers'
import { TeamWeeks } from './pbpTeams'
import { PBP_KEY_COLUMNS, playReader } from './play'
import { PlayIndex } from './playIndex'

/** What one season of play-by-play aggregates to (spec §6.1). */
export interface PbpResult {
  playerWeeks: WhPlayerWeek[]
  teamWeeks: WhTeamWeek[]
  /** Rows without a game, season or week. */
  skipped: number
}

/**
 * Spec §6.1–§6.3: a play-by-play CSV, one row at a time, into `pbp` player-weeks and team-weeks.
 * Every play read also goes into `index`, when one is given, for the FTN and participation joins.
 */
export function aggregatePbp(text: string, index?: PlayIndex): PbpResult {
  requireColumns(text, 'pbp', PBP_KEY_COLUMNS)
  const players = new PlayerWeeks()
  const teams = new TeamWeeks()
  let read: ReturnType<typeof playReader> | null = null
  let skipped = 0
  forEachCsvRow(text, (fields, header) => {
    read ??= playReader(header)
    const play = read(fields)
    if (play === 'skip') skipped++
    else if (play !== null) {
      players.add(play)
      teams.add(play)
      index?.add(play)
    }
  })
  return { playerWeeks: players.finish(), teamWeeks: teams.finish(), skipped }
}

/** One season's files as text; FTN and participation are null when not fetched. */
export interface SeasonTexts {
  pbp: string
  ftn: string | null
  part: string | null
}

/** What one season aggregates to: `pbp`, and each joined source that was given. */
export interface SeasonResult {
  pbp: PbpResult
  ftn: JoinResult | null
  part: JoinResult | null
}

/** Spec §6.1: play-by-play first (it builds the play index), then the FTN and participation joins. */
export function aggregateSeason(texts: SeasonTexts): SeasonResult {
  const index = new PlayIndex()
  const pbp = aggregatePbp(texts.pbp, index)
  return {
    pbp,
    ftn: texts.ftn === null ? null : aggregateFtn(texts.ftn, index),
    part: texts.part === null ? null : aggregateParticipation(texts.part, index)
  }
}
