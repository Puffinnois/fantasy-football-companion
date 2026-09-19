import { describe, expect, it } from 'vitest'
import { FP_TO_SLEEPER_TEAM, toSleeperDefId } from '@shared/teams'

describe('toSleeperDefId', () => {
  it('maps FantasyPros team codes to Sleeper DEF ids, JAC → JAX, others unchanged', () => {
    expect(toSleeperDefId('JAC')).toBe('JAX')
    expect(toSleeperDefId('PHI')).toBe('PHI')
    expect(toSleeperDefId('LAR')).toBe('LAR')
    expect(FP_TO_SLEEPER_TEAM).toEqual({ JAC: 'JAX' })
  })
})
