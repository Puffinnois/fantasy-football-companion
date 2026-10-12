import type { Bag } from './bag'
import { forEachJoinedRow, type Cells, type JoinResult } from './join'
import type { IndexedPlay, PlayIndex } from './playIndex'
import { PlayerBags, TeamBags } from './weekBags'

/** Every column the participation aggregation reads; a missing one fails the step. */
export const PART_COLUMNS = [
  'nflverse_game_id',
  'play_id',
  'offense_players',
  'defense_players',
  'offense_personnel',
  'defense_personnel',
  'offense_formation',
  'defenders_in_box',
  'number_of_pass_rushers',
  'time_to_throw',
  'was_pressure',
  'route',
  'defense_man_zone_type',
  'defense_coverage_type'
]

const DEFENSIVE_BACKS = new Set(['DB', 'CB', 'S', 'FS', 'SS', 'SAF'])

/** "1 RB, 2 TE, 2 WR" → [[1, 'RB'], [2, 'TE'], [2, 'WR']]. */
function personnelCounts(raw: string | null): [number, string][] {
  if (raw === null) return []
  return [...raw.matchAll(/(\d+)\s+([A-Z]+)/g)].map((m) => [Number(m[1]), m[2]])
}

/**
 * The offense's personnel group as football names it: backs (RB + FB) then tight ends, "11", "12",
 * "21". Until 2022 nflverse lists "1 RB, 1 TE, 3 WR"; from 2023 every position ("1 C, 2 G, 1 QB,
 * 1 RB, 2 T, 1 TE, 3 WR"), so the group is counted rather than stored as published (spec §12).
 */
export function offensePersonnel(raw: string | null): string | null {
  const counts = personnelCounts(raw)
  if (counts.length === 0) return null
  let backs = 0
  let ends = 0
  for (const [n, position] of counts) {
    if (position === 'RB' || position === 'FB') backs += n
    if (position === 'TE') ends += n
  }
  return `${backs}${ends}`
}

/** The number of defensive backs ("4" base, "5" nickel, "6" dime), from either format. */
export function defensiveBacks(raw: string | null): string | null {
  const counts = personnelCounts(raw)
  if (counts.length === 0) return null
  return String(
    counts.reduce((sum, [n, position]) => sum + (DEFENSIVE_BACKS.has(position) ? n : 0), 0)
  )
}

function ids(raw: string | null): string[] {
  return raw === null ? [] : raw.split(';').filter((id) => id !== '')
}

/** A box or rusher count; participation writes 0 where it has none (special teams, from 2023). */
const charted = (n: number | null): number | null => (n !== null && n > 0 ? n : null)

/** `MAN_COVERAGE` / `ZONE_COVERAGE` → man / zone. */
function manZone(c: Cells): 'man' | 'zone' | null {
  const raw = c.text('defense_man_zone_type')
  return raw === 'MAN_COVERAGE' ? 'man' : raw === 'ZONE_COVERAGE' ? 'zone' : null
}

function onOffense(b: Bag, c: Cells, p: IndexedPlay, personnel: string | null): void {
  b.add('off_snaps')
  b.tally('off_personnel', personnel)
  if (p.passerId === null) return
  b.add('off_dropbacks')
  const coverage = manZone(c)
  if (coverage) b.add(`off_dropbacks_${coverage}`)
}

function receiver(b: Bag, c: Cells, p: IndexedPlay): void {
  b.tally('rec_routes', c.text('route'))
  const coverage = manZone(c)
  if (coverage === null) return
  b.add(`rec_tgt_${coverage}`)
  if (p.complete) b.add(`rec_yds_${coverage}`, p.receivingYards)
}

function passer(b: Bag, c: Cells, p: IndexedPlay): void {
  const ttt = charted(c.num('time_to_throw'))
  if (ttt !== null) {
    b.add('pass_ttt_sum', ttt)
    b.add('pass_ttt_n')
  }
  if (c.flag('was_pressure')) {
    b.add('pass_pressured')
    b.add('pass_pressured_epa_sum', p.qbEpa)
  }
}

function team(b: Bag, c: Cells, p: IndexedPlay, personnel: string | null): void {
  b.tally('personnel', personnel)
  b.tally('dbs', defensiveBacks(c.text('defense_personnel')))
  b.tally('formation', c.text('offense_formation'))
  const box = charted(c.num('defenders_in_box'))
  if (box !== null) {
    b.add('box_sum', box)
    b.add('box_n')
  }
  if (p.passerId === null) return
  const rushers = charted(c.num('number_of_pass_rushers'))
  if (rushers !== null) {
    b.add('rushers_sum', rushers)
    b.add('rushers_n')
  }
  const coverage = manZone(c)
  if (coverage) b.add(coverage)
  b.tally('coverage', c.text('defense_coverage_type'))
  b.addIf('pressures', c.flag('was_pressure'))
}

/** Spec §6.5: participation, joined to play-by-play, into `part` player-weeks and team-weeks. */
export function aggregateParticipation(text: string, index: PlayIndex): JoinResult {
  const players = new PlayerBags('part')
  const teams = new TeamBags('part')
  const counted = forEachJoinedRow(
    text,
    'part',
    index,
    { gameColumn: 'nflverse_game_id', playColumn: 'play_id', required: PART_COLUMNS },
    (c, p) => {
      if (!p.snap || !p.posteam || !p.defteam) return
      const personnel = offensePersonnel(c.text('offense_personnel'))
      for (const id of ids(c.text('offense_players'))) {
        onOffense(players.bag(p, id, p.posteam), c, p, personnel)
      }
      for (const id of ids(c.text('defense_players'))) {
        players.bag(p, id, p.defteam).add('def_snaps')
      }
      if (!p.scrimmage) return
      if (p.receiverId) receiver(players.bag(p, p.receiverId, p.posteam), c, p)
      if (p.passerId) passer(players.bag(p, p.passerId, p.posteam), c, p)
      for (const b of teams.both(p, p.posteam, p.defteam)) team(b, c, p, personnel)
    }
  )
  return { playerWeeks: players.finish(), teamWeeks: teams.finish(), ...counted }
}
