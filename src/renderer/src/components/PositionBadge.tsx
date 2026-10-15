import { PosChip } from '@/components/edition'

/** Position chip for the screens without an Edition design yet; same look as the Edition boards. */
export function PositionBadge({ position }: { position: string | null }): React.JSX.Element {
  return <PosChip position={position} size="sm" />
}
