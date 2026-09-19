import type { FcRawRecord } from '@main/sources/fantasycalc'

/** Four records of `/values/current?isDynasty=false`; the rookie has no Sleeper id yet. */
export const values: FcRawRecord[] = [
  {
    player: { name: 'Justin Jefferson', sleeperId: '6794', position: 'WR' },
    value: 10512,
    overallRank: 1,
    positionRank: 1,
    trend30Day: 120,
    maybeTier: 1
  },
  {
    player: { name: 'Saquon Barkley', sleeperId: '4866', position: 'RB' },
    value: 9340,
    overallRank: 2,
    positionRank: 1,
    trend30Day: -310,
    maybeTier: 1
  },
  {
    player: { name: 'James Cook', sleeperId: '8259', position: 'RB' },
    value: 6100,
    overallRank: 15,
    positionRank: 6,
    trend30Day: 0,
    maybeTier: null
  },
  {
    player: { name: 'Unknown Rookie', sleeperId: null, position: 'WR' },
    value: 900,
    overallRank: 120,
    positionRank: 50,
    trend30Day: 40,
    maybeTier: 9
  }
]
