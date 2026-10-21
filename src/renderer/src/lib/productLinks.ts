import { createContext, useContext } from 'react'
import type { PlayerLink } from '@shared/stats/types'

/**
 * Stats-analysis spec §9.4: the two products open each other's player pages. App provides the
 * handlers; outside it (a screen rendered on its own) there are none.
 */
export interface ProductLinks {
  /** Companion Stats on the player's dashboard, or a team defense's team dashboard. */
  openStats: (link: PlayerLink) => void
}

export const ProductLinksContext = createContext<ProductLinks | null>(null)

export function useProductLinks(): ProductLinks | null {
  return useContext(ProductLinksContext)
}
