import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table'
import { SlideOver } from '@/components/SlideOver'
import { fmtPoints, relativeTime } from '@/lib/format'
import { columnGroups } from '@/lib/playersTableView'
import { LINEUP_POSITIONS } from '@shared/rules'
import type { ReplacementLevel, ValueContext } from '@shared/types'

interface ValueHelpProps {
  open: boolean
  onClose: () => void
  context: ValueContext | null
}

function Term({ name, children }: { name: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div>
      <dt className="font-medium">{name}</dt>
      <dd className="text-muted-foreground">{children}</dd>
    </div>
  )
}

const level = (r: ReplacementLevel | null): string => (r ? fmtPoints(r.level) : '—')
const starters = (r: ReplacementLevel | null): string => (r ? String(r.starters) : '—')

/** Plain-language definitions of the Value columns (spec §2) plus this league's replacement table. */
export function ValueHelp({ open, onClose, context }: ValueHelpProps): React.JSX.Element {
  const teams = context?.teamCount ?? 0
  return (
    <SlideOver open={open} onClose={onClose} title="How value is calculated">
      <dl className="space-y-3 text-sm">
        <Term name="PPG">
          This league&apos;s points per game, over the games the player&apos;s team played. Byes and
          weeks before the player&apos;s first appearance don&apos;t count; a played week scoring 0
          does.
        </Term>
        <Term name="VAL (season)">
          PPG minus the replacement PPG at the position — how much better the player has been than a
          freely available starter.
        </Term>
        <Term name="ROS">
          Projected points for the remaining weeks: Sleeper&apos;s weekly projections scored with
          this league&apos;s rules, from the current week on, skipping weeks already played.
        </Term>
        <Term name="VAL (ROS)">ROS minus the replacement ROS points at the position.</Term>
        <Term name="RK">
          Rank within the position by that VAL. The ALL tab sorts across positions.
        </Term>
        <Term name="Replacement level">
          The (N+1)-th best player at a position, where N is the number of league starters there:
          dedicated slots × {teams || 'the number of'} teams, plus the flex slots handed one by one
          to whichever eligible position has the best next player. Computed separately for PPG and
          for ROS, so the starter counts can differ.
        </Term>
      </dl>
      <h3 className="mt-5 text-sm font-semibold">Signals</h3>
      <dl className="mt-2 space-y-3 text-sm">
        {columnGroups('ALL', 'value')
          .flatMap((g) => g.columns)
          .filter((c) => c.kind === 'signal')
          .map((c) => (
            <Term key={c.key} name={c.label}>
              {c.description}
            </Term>
          ))}
        <Term name="Defense vs position">
          For every NFL defense, the league points it has allowed per game to each position this
          season, ranked from 1 (allows the fewest — hardest matchup) upwards. A defense is unranked
          until it has played. SOS averages the ranks of the remaining opponents; the detail panel
          shows every remaining week.
        </Term>
        <Term name="Gates">
          Usage trends need 2 games with the metric; floor, ceiling and start % need 3 games.
          Players not matched to nflverse have no signals.
        </Term>
      </dl>
      <h3 className="mt-5 text-sm font-semibold">Experts</h3>
      <dl className="mt-2 space-y-3 text-sm">
        {columnGroups('ALL', 'value')
          .flatMap((g) => g.columns)
          .filter((c) => c.kind === 'expert')
          .map((c) => (
            <Term key={c.key} name={c.label}>
              {c.description}
            </Term>
          ))}
        <Term name="Sources">
          FantasyPros expert consensus rankings (ECR), fetched in {context?.expert.scoring ?? 'PPR'}{' '}
          scoring because this league awards{' '}
          {context?.expert.scoring === 'PPR'
            ? 'a full point or more'
            : context?.expert.scoring === 'HALF'
              ? 'less than a point'
              : 'nothing'}{' '}
          per reception; FantasyCalc trade values, computed from real redraft trades and independent
          of scoring. In Projection mode the Experts group shows the week&apos;s start/sit ECR and
          grade from the same FantasyPros source. Neither source is fetched for past seasons, so
          their columns are empty there.
        </Term>
        <Term name="Reading Δ ECR">
          Both ranks are ordinal within the position, so +9 on an RB means the experts rank him nine
          RB spots lower than our ROS VAL does. FLEX is folded into our replacement level but not
          into ECR, so RB/WR/TE gaps deserve a second look. Above +3 reads green (a buy cue), below
          −3 amber (a sell-high cue); the experts&apos; SPREAD says how much they agree.
        </Term>
        <Term name="Freshness">
          ECR updated {relativeTime(context?.expert.ecrUpdatedAt)} · market values updated{' '}
          {relativeTime(context?.expert.marketUpdatedAt)}. Rankings refresh with the rest of the
          data: the current week&apos;s ECR every 3 h, rest-of-season ECR and market values every 12
          h; a scoring change re-fetches the rankings on the next refresh.
        </Term>
      </dl>
      {context?.hasMyTeam && (
        <>
          <h3 className="mt-5 text-sm font-semibold">Mine</h3>
          <dl className="mt-2 space-y-3 text-sm">
            {columnGroups('ALL', 'value', true)
              .filter((g) => g.label === 'Mine')
              .flatMap((g) => g.columns)
              .map((c) => (
                <Term key={c.key} name={c.label}>
                  {c.description}
                </Term>
              ))}
            <Term name="Same position only">
              FLEX is already in the replacement level, so ROS VAL compares across positions — but a
              cross-position swap (drop a WR to add this RB) needs a lineup model and is not
              suggested. Players on IR or the taxi squad are not counted as my players at the
              position; the My team chip still lists them.
            </Term>
          </dl>
        </>
      )}
      {context && (
        <Table className="mt-4">
          <TableHeader>
            <TableRow>
              <TableHead>Pos</TableHead>
              <TableHead className="text-right">Starters</TableHead>
              <TableHead className="text-right">Repl. PPG</TableHead>
              <TableHead className="text-right">Repl. ROS</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {LINEUP_POSITIONS.map((pos) => {
              const r = context.replacement[pos]
              const std = r?.std ?? null
              const ros = r?.ros ?? null
              const count =
                std && ros && std.starters !== ros.starters
                  ? `${std.starters} / ${ros.starters}`
                  : starters(std ?? ros)
              return (
                <TableRow key={pos}>
                  <TableCell className="font-medium">{pos}</TableCell>
                  <TableCell className="text-right tabular-nums">{count}</TableCell>
                  <TableCell className="text-right tabular-nums">{level(std)}</TableCell>
                  <TableCell className="text-right tabular-nums">{level(ros)}</TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      )}
      {context && (
        <p className="mt-3 text-xs text-muted-foreground">
          Season {context.season} · ROS counts from week {context.currentWeek}
          {context.projectionsStored ? '' : ' · no projections stored'}.
        </p>
      )}
    </SlideOver>
  )
}
