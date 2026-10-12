import { counts, isScrimmage, isSnap, type GameWeek, type Play } from './play'

/**
 * What the FTN and participation joins need of a play (spec §6.1). The roles are set only where the
 * `pbp` player families count the play, so a joined count lines up with its `pbp` total.
 */
export interface IndexedPlay extends GameWeek {
  posteam: string | null
  defteam: string | null
  /** The players on the field get a snap (`isSnap`, spec §12). */
  snap: boolean
  /** A counting scrimmage snap (`isScrimmage`): the plays the team counts are over. */
  scrimmage: boolean
  /** The dropback QB (`passer_id`) on a counting dropback, sacks and scrambles included. */
  passerId: string | null
  /** The rusher on a counting carry (`play_type` = run). */
  rusherId: string | null
  /** The target on a counting pass attempt (not a sack). */
  receiverId: string | null
  epa: number | null
  qbEpa: number | null
  receivingYards: number | null
  complete: boolean
}

/** The play index: every REG / POST play of a season by `game_id` + `play_id`. */
export class PlayIndex {
  private readonly plays = new Map<string, IndexedPlay>()

  get size(): number {
    return this.plays.size
  }

  add(p: Play): void {
    if (p.playId === null) return
    const counted = counts(p)
    this.plays.set(`${p.gameId}|${p.playId}`, {
      season: p.season,
      seasonType: p.seasonType,
      week: p.week,
      home: p.home,
      away: p.away,
      posteam: p.posteam,
      defteam: p.defteam,
      snap: isSnap(p),
      scrimmage: isScrimmage(p),
      passerId: counted && p.dropback ? p.passerId : null,
      rusherId: counted && p.playType === 'run' ? p.rusherId : null,
      receiverId: counted && p.passAttempt && !p.sack ? p.receiverId : null,
      epa: p.epa,
      qbEpa: p.qbEpa,
      receivingYards: p.receivingYards,
      complete: p.complete
    })
  }

  /** The play `playId` of `gameId`; ids are compared as numbers ("40" = "40.0"). */
  get(gameId: string, playId: number): IndexedPlay | undefined {
    return this.plays.get(`${gameId}|${playId}`)
  }
}
