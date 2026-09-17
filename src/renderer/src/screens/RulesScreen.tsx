import { Fragment, useCallback, useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table'
import { api } from '@/lib/api'
import { errorMessage, relativeTime } from '@/lib/format'
import {
  addableKeys,
  addableSlots,
  isOverridable,
  OVERRIDE_POSITIONS,
  scoringGroups,
  unsupportedKeys
} from '@/lib/rulesView'
import { cn } from '@/lib/utils'
import type { LeagueSettings, Position, Rules, StatKey, WaiverType } from '@shared/rules'

const selectClass =
  'h-9 rounded-md border border-input bg-transparent px-2 text-sm text-foreground dark:bg-input/30'

interface NumberFieldProps {
  value: number | undefined
  onChange: (value: number | undefined) => void
  placeholder?: string
  integer?: boolean
  className?: string
}

function NumberField({
  value,
  onChange,
  placeholder,
  integer,
  className
}: NumberFieldProps): React.JSX.Element {
  return (
    <Input
      type="number"
      step={integer ? 1 : 'any'}
      defaultValue={value ?? ''}
      placeholder={placeholder}
      onChange={(e) => {
        if (e.target.value === '') return onChange(undefined)
        const v = e.target.valueAsNumber
        if (Number.isFinite(v)) onChange(v)
      }}
      className={cn('h-7 w-20 px-2 text-right text-xs tabular-nums', className)}
    />
  )
}

function Field({
  label,
  children
}: {
  label: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
      {label}
      {children}
    </label>
  )
}

function RemoveButton({
  label,
  onClick
}: {
  label: string
  onClick: () => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="text-muted-foreground transition-colors hover:text-destructive"
    >
      <X className="size-3.5" />
    </button>
  )
}

interface RulesScreenProps {
  /** Called after rules are saved (points were recomputed) so other screens reload. */
  onSaved?: () => void
}

export function RulesScreen({ onSaved }: RulesScreenProps = {}): React.JSX.Element {
  const [saved, setSaved] = useState<Rules | null>(null)
  const [draft, setDraft] = useState<Rules | null>(null)
  const [version, setVersion] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmReimport, setConfirmReimport] = useState(false)

  const adopt = useCallback((rules: Rules): void => {
    setSaved(rules)
    setDraft(rules)
    setVersion((v) => v + 1)
    setConfirmReimport(false)
  }, [])

  useEffect(() => {
    void api.rules
      .get()
      .then((r) => {
        setError(r ? null : 'No rules stored yet — import a league first.')
        if (r) adopt(r)
      })
      .catch((err) => setError(errorMessage(err)))
  }, [adopt])

  const update = (fn: (r: Rules) => Rules): void => setDraft((d) => (d ? fn(d) : d))
  const setPoints = (key: StatKey, points: number): void =>
    update((r) => ({ ...r, scoring: { ...r.scoring, [key]: points } }))
  const removeStat = (key: StatKey): void =>
    update((r) => {
      const scoring = { ...r.scoring }
      delete scoring[key]
      return { ...r, scoring }
    })
  const setOverride = (position: Position, key: StatKey, points: number | undefined): void =>
    update((r) => {
      const current = { ...(r.positionOverrides[position] ?? {}) }
      if (points === undefined) delete current[key]
      else current[key] = points
      const positionOverrides = { ...r.positionOverrides }
      if (Object.keys(current).length === 0) delete positionOverrides[position]
      else positionOverrides[position] = current
      return { ...r, positionOverrides }
    })
  const setSlot = (slot: string, count: number): void =>
    update((r) => ({
      ...r,
      rosterSlots: r.rosterSlots.map((s) => (s.slot === slot ? { ...s, count } : s))
    }))
  const addSlot = (slot: string): void =>
    update((r) => ({ ...r, rosterSlots: [...r.rosterSlots, { slot, count: 1 }] }))
  const removeSlot = (slot: string): void =>
    update((r) => ({ ...r, rosterSlots: r.rosterSlots.filter((s) => s.slot !== slot) }))
  const setSetting = <K extends keyof LeagueSettings>(key: K, value: LeagueSettings[K]): void =>
    update((r) => ({ ...r, settings: { ...r.settings, [key]: value } }))

  async function save(): Promise<void> {
    if (!draft) return
    setBusy(true)
    setError(null)
    try {
      adopt(await api.rules.update(draft))
      onSaved?.()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function reimport(): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      adopt(await api.rules.reimportFromSleeper())
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  if (!draft || !saved) {
    return <div className="text-sm text-muted-foreground">{error ?? 'Loading…'}</div>
  }

  const dirty = JSON.stringify(draft) !== JSON.stringify(saved)
  const groups = scoringGroups(draft.scoring)
  const unsupported = unsupportedKeys(draft.scoring)
  const addable = addableKeys(draft.scoring)
  const slotsToAdd = addableSlots(draft.rosterSlots)
  const overrideColumns = OVERRIDE_POSITIONS.length

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="mr-auto">
          <h1 className="text-2xl font-semibold">Rules</h1>
          <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
            {saved.source === 'custom' ? (
              <Badge>Customized</Badge>
            ) : (
              <Badge variant="secondary">Imported from Sleeper</Badge>
            )}
            <span>updated {relativeTime(saved.updatedAt)}</span>
          </p>
        </div>
        {dirty && (
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => adopt(saved)}>
            Discard
          </Button>
        )}
        <Button size="sm" disabled={!dirty || busy} onClick={() => void save()}>
          Save
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() =>
            saved.source === 'custom' || dirty ? setConfirmReimport(true) : void reimport()
          }
        >
          Re-import from Sleeper
        </Button>
      </div>

      {confirmReimport && (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm">
          <span className="mr-auto">
            This replaces your customized rules with the league&apos;s current Sleeper settings.
          </span>
          <Button size="sm" variant="destructive" disabled={busy} onClick={() => void reimport()}>
            Overwrite
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setConfirmReimport(false)}>
            Cancel
          </Button>
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      {unsupported.length > 0 && (
        <p className="text-sm text-muted-foreground">
          Not computable from nflverse data (scored as 0):{' '}
          <span className="font-mono text-xs">{unsupported.join(', ')}</span>
        </p>
      )}

      <div key={version} className="space-y-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Scoring</CardTitle>
            <select
              className={selectClass}
              value=""
              onChange={(e) => {
                if (e.target.value) setPoints(e.target.value, 0)
              }}
            >
              <option value="">Add stat…</option>
              {addable.map((k) => (
                <option key={k.key} value={k.key}>
                  {k.label} ({k.key})
                </option>
              ))}
            </select>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Stat</TableHead>
                  <TableHead>Key</TableHead>
                  <TableHead className="text-right">Points</TableHead>
                  {OVERRIDE_POSITIONS.map((p) => (
                    <TableHead key={p} className="text-right">
                      {p}
                    </TableHead>
                  ))}
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {groups.map((g) => (
                  <Fragment key={g.category}>
                    <TableRow className="bg-muted/30 hover:bg-muted/30">
                      <TableCell
                        colSpan={4 + overrideColumns}
                        className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                      >
                        {g.label}
                      </TableCell>
                    </TableRow>
                    {g.rows.map((row) => (
                      <TableRow key={row.key} className={cn(!row.supported && 'opacity-60')}>
                        <TableCell>
                          {row.label}
                          {!row.supported && (
                            <Badge variant="outline" className="ml-2 text-[10px]">
                              unsupported
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {row.key}
                        </TableCell>
                        <TableCell className="text-right">
                          <NumberField
                            value={row.points}
                            onChange={(v) => setPoints(row.key, v ?? 0)}
                          />
                        </TableCell>
                        {OVERRIDE_POSITIONS.map((p) => (
                          <TableCell key={p} className="text-right">
                            {isOverridable(g.category) && (
                              <NumberField
                                value={draft.positionOverrides[p]?.[row.key]}
                                placeholder={String(row.points)}
                                onChange={(v) => setOverride(p, row.key, v)}
                                className="w-16"
                              />
                            )}
                          </TableCell>
                        ))}
                        <TableCell>
                          <RemoveButton
                            label={`Remove ${row.key}`}
                            onClick={() => removeStat(row.key)}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </Fragment>
                ))}
              </TableBody>
            </Table>
            <p className="mt-3 text-xs text-muted-foreground">
              Position columns override the base points for that position; leave blank to inherit.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Roster slots</CardTitle>
            <select
              className={selectClass}
              value=""
              onChange={(e) => {
                if (e.target.value) addSlot(e.target.value)
              }}
            >
              <option value="">Add slot…</option>
              {slotsToAdd.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              {draft.rosterSlots.map((s) => (
                <div key={s.slot} className="flex items-center gap-2 rounded-md border px-3 py-2">
                  <span className="w-24 text-sm font-medium">{s.slot}</span>
                  <NumberField
                    value={s.count}
                    integer
                    onChange={(v) => setSlot(s.slot, v ?? 0)}
                    className="w-14"
                  />
                  <RemoveButton label={`Remove ${s.slot}`} onClick={() => removeSlot(s.slot)} />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">League settings</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <Field label="Teams">
              <NumberField
                value={draft.settings.numTeams}
                integer
                onChange={(v) => setSetting('numTeams', v ?? 0)}
                className="w-full text-left"
              />
            </Field>
            <Field label="Waivers">
              <select
                className={selectClass}
                value={draft.settings.waiverType}
                onChange={(e) => setSetting('waiverType', e.target.value as WaiverType)}
              >
                <option value="faab">FAAB</option>
                <option value="priority">Priority</option>
              </select>
            </Field>
            <Field label="FAAB budget">
              <NumberField
                value={draft.settings.faabBudget}
                integer
                onChange={(v) => setSetting('faabBudget', v)}
                className="w-full text-left"
              />
            </Field>
            <Field label="Trade deadline (week)">
              <NumberField
                value={draft.settings.tradeDeadlineWeek}
                integer
                placeholder="none"
                onChange={(v) => setSetting('tradeDeadlineWeek', v)}
                className="w-full text-left"
              />
            </Field>
            <Field label="Playoffs start (week)">
              <NumberField
                value={draft.settings.playoffStartWeek}
                integer
                onChange={(v) => setSetting('playoffStartWeek', v)}
                className="w-full text-left"
              />
            </Field>
            <Field label="Playoff teams">
              <NumberField
                value={draft.settings.playoffTeams}
                integer
                onChange={(v) => setSetting('playoffTeams', v)}
                className="w-full text-left"
              />
            </Field>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
