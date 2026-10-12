import type { WhPlayerWeek, WhTeamWeek } from '@main/db/repos/warehouse'
import { Bag } from './bag'
import { opponentOf, type GameWeek } from './play'

interface PlayerEntry {
  week: GameWeek
  playerKey: string
  team: string | null
  bag: Bag
}

/** One bag per player and week for `source` (gsis ids), turned into player-week rows. */
export class PlayerBags {
  private readonly entries = new Map<string, PlayerEntry>()

  constructor(private readonly source: string) {}

  /** The bag of `id` in this week; `team` is the side the player was on (the first one seen wins). */
  bag(w: GameWeek, id: string, team: string | null): Bag {
    const key = `${w.season}|${w.seasonType}|${w.week}|${id}`
    const entry = this.entries.get(key)
    if (entry) {
      entry.team ??= team
      return entry.bag
    }
    const bag = new Bag()
    this.entries.set(key, { week: w, playerKey: id, team, bag })
    return bag
  }

  /** Rows with at least one non-zero value. */
  finish(): WhPlayerWeek[] {
    const rows: WhPlayerWeek[] = []
    for (const { week, playerKey, team, bag } of this.entries.values()) {
      const data = bag.data()
      if (Object.keys(data).length === 0) continue
      rows.push({
        source: this.source,
        season: week.season,
        seasonType: week.seasonType,
        week: week.week,
        playerKey,
        keyType: 'gsis',
        team,
        opponent: opponentOf(week, team),
        data
      })
    }
    return rows
  }
}

interface Side {
  week: GameWeek
  team: string
  off: Bag
  def: Bag
}

/** One `off_` and one `def_` bag per team and week for `source`, turned into team-week rows. */
export class TeamBags {
  private readonly sides = new Map<string, Side>()

  constructor(private readonly source: string) {}

  private side(w: GameWeek, team: string): Side {
    const key = `${w.season}|${w.seasonType}|${w.week}|${team}`
    let side = this.sides.get(key)
    if (!side) {
      side = { week: w, team, off: new Bag(), def: new Bag() }
      this.sides.set(key, side)
    }
    return side
  }

  /** The offense's `off_` bag and the defense's `def_` bag for a play between `team` and `opponent`. */
  both(w: GameWeek, team: string, opponent: string): Bag[] {
    return [this.side(w, team).off, this.side(w, opponent).def]
  }

  finish(): WhTeamWeek[] {
    const rows: WhTeamWeek[] = []
    for (const { week, team, off, def } of this.sides.values()) {
      const data = { ...off.data('off_'), ...def.data('def_') }
      if (Object.keys(data).length === 0) continue
      rows.push({
        source: this.source,
        season: week.season,
        seasonType: week.seasonType,
        week: week.week,
        team,
        opponent: opponentOf(week, team),
        data
      })
    }
    return rows
  }
}
