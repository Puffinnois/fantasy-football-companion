import { useCallback, useEffect, useState } from 'react'
import { Check, X } from 'lucide-react'
import { EditionFooter, Masthead, ModeTabs, PosChip, SectionHead } from '@/components/edition'
import { api } from '@/lib/api'
import { errorMessage, relativeTime } from '@/lib/format'
import {
  addableKeys,
  addableSlots,
  categoryTabs,
  IR_TIP,
  irStatusesOf,
  isOverridable,
  lineupShape,
  OVERRIDE_POSITIONS,
  PLAYOFF_FORMATS,
  RESERVE_SLOTS,
  rosterSummary,
  scoringGroups,
  seasonStrip,
  SLOT_NAME,
  toggleIrStatus,
  unsupportedKeys
} from '@/lib/rulesView'
import { cn } from '@/lib/utils'
import {
  IR_STATUSES,
  type LeagueSettings,
  type Position,
  type Rules,
  type StatKey
} from '@shared/rules'
import { STAT_CATEGORIES, STAT_KEY_INFO, type StatCategory } from '@shared/statKeys'

type Tab = 'scoring' | 'roster' | 'league'
const TABS: { key: Tab; label: string }[] = [
  { key: 'scoring', label: 'Scoring' },
  { key: 'roster', label: 'Roster' },
  { key: 'league', label: 'League' }
]
const POS_TEXT: Record<string, string> = {
  QB: 'text-pos-qb',
  RB: 'text-pos-rb',
  WR: 'text-pos-wr',
  TE: 'text-pos-te'
}
const addSelect =
  'h-8 cursor-pointer rounded-full border-[1.5px] border-dashed border-line bg-transparent px-3 font-cond text-[14px] leading-none font-bold tracking-[0.06em] text-fg-2 uppercase outline-none hover:border-ink'
const fmtNum = (n: number | undefined): string => (n === undefined ? '' : String(n))

/**
 * Number input that keeps what is typed ("-", "1.") and reports a number when it parses, undefined
 * when blank. Remounted (key) when the rules are adopted, so it re-reads `value`.
 */
function NumInput({
  value,
  onChange,
  placeholder,
  title,
  className,
  ariaLabel
}: {
  value: number | undefined
  onChange: (value: number | undefined) => void
  placeholder?: string
  title?: string
  className?: string
  ariaLabel?: string
}): React.JSX.Element {
  const [text, setText] = useState(fmtNum(value))
  return (
    <input
      type="text"
      inputMode="decimal"
      value={text}
      placeholder={placeholder}
      title={title}
      aria-label={ariaLabel}
      onChange={(e) => {
        const raw = e.target.value
        setText(raw)
        if (raw === '' || raw === '-') return onChange(undefined)
        const v = Number(raw)
        if (Number.isFinite(v)) onChange(v)
      }}
      className={cn(
        'h-[30px] rounded-[3px] border px-2 text-right font-mono text-[13px] font-semibold text-fg outline-none focus:border-ink',
        className
      )}
    />
  )
}

function Stepper({
  value,
  onChange,
  min,
  max,
  label
}: {
  value: number
  onChange: (v: number) => void
  min: number
  max: number
  label: string
}): React.JSX.Element {
  const btn =
    'flex size-[26px] cursor-pointer items-center justify-center rounded-full border border-line text-[15px] leading-none font-semibold text-fg hover:border-ink disabled:cursor-default disabled:opacity-35'
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        aria-label={`Fewer ${label}`}
        title="One fewer"
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
        className={btn}
      >
        −
      </button>
      <span className="min-w-9 text-center font-cond text-[28px] leading-none font-extrabold">
        {value}
      </span>
      <button
        type="button"
        aria-label={`More ${label}`}
        title="One more"
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
        className={btn}
      >
        +
      </button>
    </div>
  )
}

function Segmented<V extends string | number>({
  options,
  value,
  onChange
}: {
  options: { value: V; label: string }[]
  value: V
  onChange: (v: V) => void
}): React.JSX.Element {
  return (
    <div className="flex rounded-full border border-line p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
          className={cn(
            'h-7 cursor-pointer rounded-full px-3 font-cond text-[14px] leading-none font-bold tracking-[0.06em] uppercase',
            o.value === value ? 'bg-ink text-paper' : 'text-fg-2 hover:text-fg'
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function SettingRow({
  label,
  help,
  children
}: {
  label: string
  help: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="flex h-16 items-center justify-between gap-4 border-b border-line">
      <div className="flex flex-col gap-[5px]">
        <span className="font-cond text-[16px] leading-none font-extrabold tracking-[0.08em] uppercase">
          {label}
        </span>
        <span className="text-[12px] leading-none text-fg-3">{help}</span>
      </div>
      {children}
    </div>
  )
}

function WeekInput({
  value,
  onChange,
  placeholder,
  label
}: {
  value: number | undefined
  onChange: (v: number | undefined) => void
  placeholder?: string
  label: string
}): React.JSX.Element {
  return (
    <label className="flex items-center gap-2 font-cond text-[13px] leading-none font-bold tracking-[0.1em] text-fg-3 uppercase">
      Week
      <NumInput
        value={value}
        onChange={(v) => onChange(v === undefined ? undefined : Math.round(v))}
        placeholder={placeholder}
        ariaLabel={label}
        className="h-8 w-16 border-line bg-panel"
      />
    </label>
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
  const [tab, setTab] = useState<Tab>('scoring')
  const [category, setCategory] = useState<StatCategory | null>(null)
  const [currentWeek, setCurrentWeek] = useState(0)

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
        setError(r ? null : 'No rules stored yet. Import a league first.')
        if (r) adopt(r)
      })
      .catch((err) => setError(errorMessage(err)))
    void api.players
      .options()
      .then((o) => setCurrentWeek(o.currentWeek))
      .catch(() => undefined)
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

  const dirty = draft !== null && saved !== null && JSON.stringify(draft) !== JSON.stringify(saved)
  const kicker = saved
    ? `${saved.source === 'custom' ? 'Customized' : 'Imported from Sleeper'} · updated ${relativeTime(saved.updatedAt)}`
    : 'Rules'

  return (
    <>
      <Masthead
        kicker={kicker}
        title="The Rulebook"
        below={<ModeTabs tabs={TABS} value={tab} onChange={setTab} />}
        right={
          saved && (
            <div className="flex flex-col items-end gap-2.5">
              {dirty && (
                <span className="flex items-center gap-1.5 font-cond text-[13px] leading-none font-bold tracking-[0.12em] text-brand-fg uppercase">
                  <span className="size-[7px] rounded-full bg-brand" />
                  Unsaved changes
                </span>
              )}
              <div className="flex items-center gap-2 font-cond text-[15px] leading-none tracking-[0.08em] uppercase">
                {dirty && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => adopt(saved)}
                    className="h-9 cursor-pointer rounded-full px-3.5 font-bold text-fg-2 uppercase hover:text-fg"
                  >
                    Discard
                  </button>
                )}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    saved.source === 'custom' || dirty ? setConfirmReimport(true) : void reimport()
                  }
                  className="h-9 cursor-pointer rounded-full border border-line px-4 font-bold text-fg uppercase hover:border-ink"
                >
                  Re-import from Sleeper
                </button>
                {dirty ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void save()}
                    className="flex h-9 cursor-pointer items-center gap-1.5 rounded-full bg-brand px-[18px] font-extrabold text-on-brand uppercase hover:brightness-105"
                  >
                    <Check className="size-[15px]" />
                    {busy ? 'Saving…' : 'Save changes'}
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled
                    className="h-9 rounded-full border border-line px-[18px] font-extrabold text-fg-3 uppercase"
                  >
                    Saved
                  </button>
                )}
              </div>
            </div>
          )
        }
      />
      {confirmReimport && (
        <div className="flex h-[52px] shrink-0 items-center justify-between gap-4 border-b border-line bg-bad-s px-8">
          <span className="font-cond text-[20px] leading-none font-extrabold uppercase">
            This replaces your rules with the league&apos;s current Sleeper settings.
          </span>
          <div className="flex gap-2 font-cond text-[14px] leading-none tracking-[0.08em] uppercase">
            <button
              type="button"
              onClick={() => setConfirmReimport(false)}
              className="h-8 cursor-pointer rounded-full border border-line px-3.5 font-bold text-fg uppercase hover:border-ink"
            >
              Keep mine
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void reimport()}
              className="h-8 cursor-pointer rounded-full bg-bad px-3.5 font-extrabold text-on-pos uppercase"
            >
              Overwrite
            </button>
          </div>
        </div>
      )}
      {!draft && !error && <div className="ed-loading flex-1">Opening the rulebook…</div>}
      {error && <div className="shrink-0 px-8 py-2.5 text-bad">{error}</div>}
      {draft && saved && (
        <div key={version} className="flex min-h-0 flex-1 flex-col">
          {tab === 'scoring' && (
            <ScoringTab
              draft={draft}
              saved={saved}
              category={category}
              onCategory={setCategory}
              setPoints={setPoints}
              removeStat={removeStat}
              setOverride={setOverride}
            />
          )}
          {tab === 'roster' && (
            <RosterTab draft={draft} setSlot={setSlot} addSlot={addSlot} removeSlot={removeSlot} />
          )}
          {tab === 'league' && (
            <LeagueTab draft={draft} currentWeek={currentWeek} setSetting={setSetting} />
          )}
        </div>
      )}
      <EditionFooter
        legend={[
          { swatch: <span className="size-[7px] rounded-full bg-brand" />, label: 'Unsaved' },
          {
            swatch: <span className="size-2.5 rounded-[2px] border border-brand bg-me" />,
            label: 'Position override'
          }
        ]}
      >
        <span>
          Saving recomputes every player&apos;s points, projections and values under these rules.
        </span>
      </EditionFooter>
    </>
  )
}

function ScoringTab({
  draft,
  saved,
  category,
  onCategory,
  setPoints,
  removeStat,
  setOverride
}: {
  draft: Rules
  saved: Rules
  category: StatCategory | null
  onCategory: (c: StatCategory) => void
  setPoints: (key: StatKey, points: number) => void
  removeStat: (key: StatKey) => void
  setOverride: (p: Position, key: StatKey, v: number | undefined) => void
}): React.JSX.Element {
  const tabs = categoryTabs(draft, saved)
  const groups = scoringGroups(draft.scoring)
  const cat = tabs.some((t) => t.category === category)
    ? category
    : (tabs[0]?.category ?? 'passing')
  const group = groups.find((g) => g.category === cat)
  const canOver = isOverridable(cat as StatCategory)
  const unsupported = unsupportedKeys(draft.scoring)
  const catLabel = tabs.find((t) => t.category === cat)?.label ?? ''
  const label = (c: StatCategory): string => STAT_CATEGORIES.find((x) => x.id === c)?.label ?? c
  const grid = 'grid-cols-[minmax(0,1fr)_170px_76px_repeat(4,64px)_28px] gap-x-3'
  return (
    <div className="flex min-h-0 flex-1 px-8">
      <div className="w-[216px] shrink-0 overflow-auto border-r border-line pt-4 pr-6 pb-6">
        <div className="pb-2 font-cond text-[12px] leading-none font-extrabold tracking-[0.14em] text-fg-3 uppercase">
          Categories
        </div>
        {tabs.map((t) => {
          const on = t.category === cat
          return (
            <button
              key={t.category}
              type="button"
              aria-pressed={on}
              onClick={() => onCategory(t.category)}
              className={cn(
                'mb-0.5 flex w-full cursor-pointer flex-col items-stretch gap-1 rounded-[4px] px-2.5 py-[9px] text-left',
                on ? 'bg-ink text-paper' : 'text-fg-2 hover:bg-hover hover:text-fg'
              )}
            >
              <span
                className={cn(
                  'flex items-center justify-between gap-2 font-cond text-[16px] leading-none tracking-[0.06em] uppercase',
                  on ? 'font-extrabold' : 'font-bold'
                )}
              >
                <span className="flex items-center gap-1.5">
                  {t.label}
                  {t.changed && <span className="size-1.5 rounded-full bg-brand" />}
                </span>
                <span className={on ? 'font-bold opacity-70' : 'text-fg-3'}>{t.count}</span>
              </span>
              {t.overrides > 0 && (
                <span
                  className={cn(
                    'font-mono text-[11px] leading-none',
                    on ? 'opacity-70' : 'text-brand-fg'
                  )}
                >
                  {t.overrides} override{t.overrides === 1 ? '' : 's'}
                </span>
              )}
            </button>
          )
        })}
      </div>
      <div className="flex min-w-0 flex-1 flex-col pl-7">
        <div className="flex h-14 shrink-0 items-center justify-between gap-4">
          <div className="flex items-baseline gap-2.5">
            <span className="font-cond text-[24px] leading-none font-extrabold tracking-[0.02em] uppercase">
              {catLabel}
            </span>
            {canOver && (
              <span className="text-[12.5px] leading-none text-fg-3">
                Position columns override the base points. Leave blank to inherit.
              </span>
            )}
          </div>
          <select
            aria-label="Add a stat"
            value=""
            onChange={(e) => {
              const key = e.target.value
              if (!key) return
              setPoints(key, 0)
              const info = STAT_KEY_INFO.get(key)
              if (info) onCategory(info.category)
            }}
            className={cn(addSelect, 'w-[230px]')}
          >
            <option value="">+ Add a stat</option>
            {addableKeys(draft.scoring).map((k) => (
              <option key={k.key} value={k.key}>
                {label(k.category)} · {k.label}
              </option>
            ))}
          </select>
        </div>
        {unsupported.length > 0 && (
          <div className="mb-2.5 shrink-0 rounded-[3px] bg-warn-s px-3 py-2 text-[12.5px] leading-[1.4]">
            Not known to this app, scored as 0:{' '}
            <span className="font-mono text-[12px]">{unsupported.join(', ')}</span>
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-auto pb-5">
          <div
            className={cn(
              'ed-label sticky top-0 z-[2] grid h-[30px] items-end border-b-2 border-ink bg-paper pb-[7px] text-fg-2',
              grid
            )}
          >
            <span>Stat</span>
            <span>Sleeper key</span>
            <span className="text-right">Points</span>
            {OVERRIDE_POSITIONS.map((p) => (
              <span key={p} className={cn('text-right', POS_TEXT[p])}>
                {p}
              </span>
            ))}
            <span />
          </div>
          {(group?.rows ?? []).map((row) => {
            const changed =
              draft.scoring[row.key] !== saved.scoring[row.key] ||
              OVERRIDE_POSITIONS.some(
                (p) =>
                  draft.positionOverrides[p]?.[row.key] !== saved.positionOverrides[p]?.[row.key]
              )
            const info = STAT_KEY_INFO.get(row.key)
            return (
              <div
                key={row.key}
                className={cn('grid h-11 items-center border-b border-line', grid)}
              >
                <div className="flex min-w-0 items-center gap-[7px]">
                  {changed && (
                    <span
                      title="Changed, not saved"
                      className="size-1.5 shrink-0 rounded-full bg-brand"
                    />
                  )}
                  <span className="truncate text-[14px] leading-[1.1] font-medium">
                    {row.label}
                  </span>
                  {!row.supported && (
                    <span className="shrink-0 rounded-[2px] px-1 py-0.5 font-cond text-[11px] leading-none font-extrabold tracking-[0.08em] text-warn uppercase shadow-[inset_0_0_0_1px_var(--warn)]">
                      Unsupported
                    </span>
                  )}
                  {row.supported && info && !info.nflverse && (
                    <span
                      title="Not in nflverse box scores: scored from Sleeper's stat lines only"
                      className="shrink-0 rounded-[2px] px-1 py-0.5 font-cond text-[11px] leading-none font-extrabold tracking-[0.08em] text-fg-3 uppercase shadow-[inset_0_0_0_1px_var(--line)]"
                    >
                      Sleeper only
                    </span>
                  )}
                </div>
                <span className="truncate font-mono text-[12px] leading-none text-fg-3">
                  {row.key}
                </span>
                <NumInput
                  value={row.points}
                  onChange={(v) => setPoints(row.key, v ?? 0)}
                  ariaLabel={`Points for ${row.key}`}
                  className="w-[76px] border-line bg-panel"
                />
                {canOver ? (
                  OVERRIDE_POSITIONS.map((p) => {
                    const cur = draft.positionOverrides[p]?.[row.key]
                    return (
                      <NumInput
                        key={p}
                        value={cur}
                        onChange={(v) => setOverride(p, row.key, v)}
                        placeholder={String(row.points)}
                        title={
                          cur === undefined ? `${p} inherits the base points` : `${p} override`
                        }
                        ariaLabel={`${p} points for ${row.key}`}
                        className={cn(
                          'w-16',
                          cur === undefined
                            ? 'border-dashed border-line bg-transparent font-normal placeholder:text-fg-3'
                            : 'border-brand bg-me'
                        )}
                      />
                    )
                  })
                ) : (
                  <span className="col-span-4 text-center text-[12px] leading-none text-fg-3">
                    Same for every position
                  </span>
                )}
                <button
                  type="button"
                  aria-label={`Remove ${row.key}`}
                  title="Remove this stat"
                  onClick={() => removeStat(row.key)}
                  className="flex size-[26px] cursor-pointer items-center justify-center rounded-full text-fg-3 hover:bg-hover hover:text-bad"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function RosterTab({
  draft,
  setSlot,
  addSlot,
  removeSlot
}: {
  draft: Rules
  setSlot: (slot: string, count: number) => void
  addSlot: (slot: string) => void
  removeSlot: (slot: string) => void
}): React.JSX.Element {
  const toAdd = addableSlots(draft.rosterSlots)
  return (
    <div className="min-h-0 flex-1 overflow-auto px-8 pt-5 pb-6">
      <SectionHead title="Your starting lineup" note={rosterSummary(draft.rosterSlots)} />
      <div className="flex flex-wrap gap-1.5 pt-4 pb-7">
        {lineupShape(draft.rosterSlots).map((slot, i) => (
          <PosChip key={`${slot}${i}`} position={slot} size="fill" className="h-[34px] w-[58px]" />
        ))}
      </div>
      <div className="flex items-end justify-between gap-4 border-b-2 border-ink pb-2">
        <span className="ed-section">Slots</span>
        {toAdd.length > 0 && (
          <select
            aria-label="Add a slot"
            value=""
            onChange={(e) => {
              if (e.target.value) addSlot(e.target.value)
            }}
            className={cn(addSelect, 'h-[30px]')}
          >
            <option value="">+ Add a slot</option>
            {toAdd.map((s) => (
              <option key={s} value={s}>
                {s} · {SLOT_NAME[s] ?? s}
              </option>
            ))}
          </select>
        )}
      </div>
      <div className="grid grid-cols-4 gap-x-7">
        {draft.rosterSlots.map((s) => (
          <div
            key={s.slot}
            className="grid h-[68px] grid-cols-[44px_minmax(0,1fr)_auto_24px] items-center gap-x-3 border-b border-line"
          >
            <PosChip position={s.slot} size="fill" className="h-[26px] w-11" />
            <div className="flex min-w-0 flex-col gap-1">
              <span className="truncate text-[13.5px] leading-[1.15] font-semibold">
                {SLOT_NAME[s.slot] ?? s.slot}
              </span>
              <span className="text-[11.5px] leading-none text-fg-3">
                {RESERVE_SLOTS.has(s.slot) ? "Doesn't score" : 'Starts every week'}
              </span>
            </div>
            <Stepper
              value={s.count}
              min={0}
              max={20}
              label={`${s.slot} slots`}
              onChange={(v) => setSlot(s.slot, v)}
            />
            <button
              type="button"
              aria-label={`Remove ${s.slot}`}
              title="Remove this slot"
              onClick={() => removeSlot(s.slot)}
              className="flex size-6 cursor-pointer items-center justify-center rounded-full text-fg-3 hover:bg-hover hover:text-bad"
            >
              <X className="size-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

function LeagueTab({
  draft,
  currentWeek,
  setSetting
}: {
  draft: Rules
  currentWeek: number
  setSetting: <K extends keyof LeagueSettings>(key: K, value: LeagueSettings[K]) => void
}): React.JSX.Element {
  const st = draft.settings
  const irs = irStatusesOf(st)
  return (
    <div className="min-h-0 flex-1 overflow-auto px-8 pt-5 pb-6">
      <SectionHead title="The season" note="Updates as you change the settings below" />
      <div className="flex gap-[3px] pt-3 pb-[22px]">
        {seasonStrip(st, currentWeek).map((w) => (
          <div key={w.week} className="flex min-w-0 flex-[1_1_0] flex-col gap-[5px]">
            <div className="flex h-3 items-end justify-end">
              {w.deadline && (
                <span className="font-cond text-[11px] leading-none font-extrabold tracking-[0.08em] whitespace-nowrap text-bad uppercase">
                  Deadline ▾
                </span>
              )}
            </div>
            <div
              className={cn(
                'flex h-10 items-center justify-center rounded-[3px] font-cond text-[16px] leading-none font-extrabold',
                w.kind === 'past' && 'bg-panel-2 text-fg-3',
                w.kind === 'now' && 'bg-ink text-paper',
                w.kind === 'next' && 'border border-line text-fg',
                w.kind === 'playoff' && 'bg-brand text-on-brand'
              )}
            >
              {w.week}
            </div>
            <div className="h-3 font-cond text-[11px] leading-none font-bold tracking-[0.08em] whitespace-nowrap uppercase">
              {w.kind === 'now' && <span>This week</span>}
              {w.round && <span className="text-brand-fg">{w.round}</span>}
            </div>
          </div>
        ))}
      </div>
      <SectionHead title="Settings" />
      <div className="grid grid-cols-2 gap-x-12">
        <SettingRow label="Teams" help="League size">
          <Stepper
            value={st.numTeams}
            min={2}
            max={32}
            label="teams"
            onChange={(v) => setSetting('numTeams', v)}
          />
        </SettingRow>
        <SettingRow label="Waivers" help="How claims are ordered">
          <Segmented
            options={[
              { value: 'priority' as const, label: 'Priority' },
              { value: 'faab' as const, label: 'FAAB' }
            ]}
            value={st.waiverType}
            onChange={(v) => setSetting('waiverType', v)}
          />
        </SettingRow>
        <SettingRow label="Trade deadline" help="Last week to trade. Blank for none">
          <WeekInput
            label="Trade deadline week"
            value={st.tradeDeadlineWeek}
            placeholder="none"
            onChange={(v) => setSetting('tradeDeadlineWeek', v)}
          />
        </SettingRow>
        <SettingRow label="FAAB budget" help="Free-agent bidding dollars per team">
          {st.waiverType === 'faab' ? (
            <label className="flex items-center gap-2 font-cond text-[15px] leading-none font-bold text-fg-3">
              $
              <NumInput
                value={st.faabBudget}
                onChange={(v) =>
                  setSetting('faabBudget', v === undefined ? undefined : Math.round(v))
                }
                ariaLabel="FAAB budget"
                className="h-8 w-[76px] border-line bg-panel"
              />
            </label>
          ) : (
            <span className="text-[12.5px] text-fg-3">Priority waivers</span>
          )}
        </SettingRow>
        <SettingRow label="Playoffs start" help="First playoff week">
          <WeekInput
            label="Playoffs start week"
            value={st.playoffStartWeek}
            onChange={(v) => setSetting('playoffStartWeek', v)}
          />
        </SettingRow>
        <SettingRow label="Playoff teams" help="How many make it">
          <Stepper
            value={st.playoffTeams ?? 0}
            min={0}
            max={16}
            label="playoff teams"
            onChange={(v) => setSetting('playoffTeams', v)}
          />
        </SettingRow>
        <SettingRow label="Playoff format" help="Weeks per round">
          <Segmented
            options={PLAYOFF_FORMATS}
            value={st.playoffRoundType ?? 0}
            onChange={(v) => setSetting('playoffRoundType', v)}
          />
        </SettingRow>
        <SettingRow label="IR slots" help="Injured reserve spots per team">
          <Stepper
            value={st.irSlots ?? 0}
            min={0}
            max={10}
            label="IR slots"
            onChange={(v) => setSetting('irSlots', v)}
          />
        </SettingRow>
        <div className="col-span-2">
          <SettingRow label="Allowed on IR" help="Injury designations that can be moved to IR">
            <div className="flex flex-wrap justify-end gap-1.5">
              {IR_STATUSES.map((status) => {
                const on = irs.includes(status)
                return (
                  <button
                    key={status}
                    type="button"
                    aria-pressed={on}
                    title={IR_TIP[status]}
                    disabled={status === 'IR'}
                    onClick={() => setSetting('irStatuses', toggleIrStatus(st.irStatuses, status))}
                    className={cn(
                      'flex h-7 items-center gap-1 rounded-full px-3 font-cond text-[13px] leading-none font-bold tracking-[0.08em] uppercase',
                      on
                        ? 'bg-ink text-paper'
                        : 'cursor-pointer border border-line text-fg-2 hover:border-ink hover:text-fg',
                      status === 'IR' ? 'cursor-default' : 'cursor-pointer'
                    )}
                  >
                    {on && <Check className="size-3" />}
                    {status}
                  </button>
                )
              })}
            </div>
          </SettingRow>
        </div>
      </div>
    </div>
  )
}
