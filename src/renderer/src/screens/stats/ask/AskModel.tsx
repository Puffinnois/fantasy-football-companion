import { useEffect, useState } from 'react'
import { StatsButton, StatsSelect } from '@/components/stats/controls'
import { SectionHead } from '@/components/stats/parts'
import { api } from '@/lib/api'
import { errorMessage } from '@/lib/format'
import { cn } from '@/lib/utils'
import {
  ANTHROPIC_BASE_URL,
  LMSTUDIO_BASE_URL,
  OLLAMA_BASE_URL,
  PRESETS as PRESET_INFO
} from '@shared/askPresets'
import type {
  CallingMode,
  LocalServer,
  ModelInfo,
  ProviderInput,
  ProviderKind,
  ProviderPreset,
  ProviderSettings,
  Reasoning,
  ToolProfile
} from '@shared/ask'

/**
 * Stats › Ask › Model (Ask spec §6.2, Plan AG1 amendment F): the models Ask can use — an Anthropic
 * key, an OpenAI-compatible service, or a local server — and which one is in use. A key goes to main
 * and is stored encrypted; it never comes back here.
 */
const KINDS: { value: ProviderKind; label: string }[] = [
  { value: 'anthropic', label: 'Anthropic (Claude API)' },
  { value: 'openai', label: 'An API service (OpenAI-compatible)' },
  { value: 'ollama', label: 'Ollama on this PC' },
  { value: 'lmstudio', label: 'LM Studio on this PC' }
]

/** The services offered, free tiers first (spec §14 point 4); the addresses are main's presets. */
const ORDER: ProviderPreset[] = ['gemini', 'groq', 'openrouter', 'openai', 'mistral', 'custom']
const SERVICES = ORDER.map((value) => ({
  value,
  label: `${PRESET_INFO[value].label}${PRESET_INFO[value].free ? ' (free tier)' : ''}`,
  baseUrl: PRESET_INFO[value].baseUrl
}))

const BASE: Record<ProviderKind, string> = {
  anthropic: ANTHROPIC_BASE_URL,
  openai: SERVICES[0].baseUrl,
  ollama: OLLAMA_BASE_URL,
  lmstudio: LMSTUDIO_BASE_URL
}

/** What leaves the PC with each kind (spec §6.2). */
const LEAVES: Record<ProviderKind, string> = {
  anthropic:
    'Your question, the analyst brief and the tool results (stats rows; league team and player names) go to Anthropic.',
  openai:
    'Your question, the analyst brief and the tool results (stats rows; league team and player names) go to this service.',
  ollama: 'Nothing leaves this computer: the model runs here.',
  lmstudio: 'Nothing leaves this computer: the model runs here.'
}

const local = (k: ProviderKind): boolean => k === 'ollama' || k === 'lmstudio'

/** A new provider's defaults: small local models get the compact profile in structured mode. */
function draft(kind: ProviderKind, preset: ProviderPreset | null = null): ProviderInput {
  const p = SERVICES.find((x) => x.value === preset)
  return {
    kind,
    preset: kind === 'openai' ? (preset ?? 'gemini') : null,
    label:
      kind === 'openai'
        ? (p?.label ?? SERVICES[0].label)
        : KINDS.find((k) => k.value === kind)!.label,
    baseUrl: kind === 'openai' ? (p?.baseUrl ?? SERVICES[0].baseUrl) : BASE[kind],
    model: kind === 'anthropic' ? 'claude-opus-5-5' : '',
    profile: local(kind) ? 'compact' : 'full',
    mode: local(kind) ? 'structured' : 'native',
    reasoning: 'off',
    key: undefined
  }
}

function Field({
  label,
  children
}: {
  label: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <label className="flex flex-col gap-1 text-[12px] text-fg-2">
      {label}
      {children}
    </label>
  )
}

const INPUT =
  'h-7 rounded-[6px] border border-line bg-panel px-2 text-[12.5px] text-fg placeholder:text-fg-3'

export function AskModel({
  onChange
}: {
  /** The providers as saved, after each change: whether a model is in use. */
  onChange?: (providers: ProviderSettings[]) => void
}): React.JSX.Element {
  const [providers, setProviders] = useState<ProviderSettings[]>([])
  const [form, setForm] = useState<(ProviderInput & { id?: number }) | null>(null)
  const [models, setModels] = useState<ModelInfo[]>([])
  const [servers, setServers] = useState<LocalServer[] | null>(null)
  const [note, setNote] = useState<{ id: number; ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = async (): Promise<void> => {
    const list = await api.ask.providers.list()
    setProviders(list)
    onChange?.(list)
  }
  useEffect(() => {
    void api.ask.providers
      .list()
      .then((list) => {
        setProviders(list)
        onChange?.(list)
      })
      .catch((err) => setError(errorMessage(err)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function act(fn: () => Promise<unknown>): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const listModels = (f: ProviderInput & { id?: number }): Promise<void> =>
    act(async () => setModels(await api.ask.providers.models(f)))

  const detect = (): Promise<void> => act(async () => setServers(await api.ask.providers.detect()))

  /** A local model found running, as a new provider's form. */
  function use(server: LocalServer, m: ModelInfo): void {
    setForm({ ...draft(server.kind), baseUrl: server.baseUrl, model: m.id })
    setModels(server.models)
  }

  async function save(): Promise<void> {
    if (!form) return
    await act(async () => {
      await api.ask.providers.save(form)
      setForm(null)
      setModels([])
      await load()
    })
  }

  const set = (patch: Partial<ProviderInput>): void => setForm((f) => (f ? { ...f, ...patch } : f))

  return (
    <section className="flex flex-col gap-3 rounded-[10px] border border-line bg-panel px-5 py-4">
      <SectionHead title="Ask in the app" note="Model" />
      <p className="m-0 text-[12.5px] leading-[1.45] text-fg-3">
        Pick the model that answers questions inside the app: an API key, a free API tier, or a
        model running on this PC. Nothing is sent anywhere until you add one.
      </p>

      {providers.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-1.5 p-0" aria-label="Models">
          {providers.map((p) => (
            <li
              key={p.id}
              className="flex flex-col gap-1 rounded-[7px] border border-line px-3 py-2"
            >
              <div className="flex items-center gap-2">
                <input
                  type="radio"
                  name="ask-provider"
                  aria-label={`Use ${p.label} · ${p.model}`}
                  checked={p.active}
                  onChange={() =>
                    void act(async () => {
                      await api.ask.providers.activate(p.id)
                      await load()
                    })
                  }
                />
                <span className="text-[13px] font-medium">{p.label}</span>
                <span className="font-mono text-[12px] text-fg-2">{p.model}</span>
                <span className="text-[11.5px] text-fg-3">
                  {p.profile} · {p.mode}
                  {p.reasoning !== 'off' ? ` · reasoning ${p.reasoning}` : ''}
                </span>
                <span className="ml-auto flex gap-1.5">
                  <StatsButton
                    disabled={busy}
                    onClick={() =>
                      void act(async () => {
                        const r = await api.ask.providers.test(p.id)
                        setNote({
                          id: p.id,
                          ok: r.ok,
                          text: `${r.message} · ${(r.ms / 1000).toFixed(1)} s`
                        })
                      })
                    }
                  >
                    Test
                  </StatsButton>
                  <StatsButton
                    disabled={busy}
                    onClick={() => {
                      setForm({ ...p, key: undefined })
                      setModels([])
                    }}
                  >
                    Edit
                  </StatsButton>
                  <StatsButton
                    disabled={busy}
                    onClick={() =>
                      void act(async () => {
                        await api.ask.providers.remove(p.id)
                        await load()
                      })
                    }
                  >
                    Remove
                  </StatsButton>
                </span>
              </div>
              {note?.id === p.id && (
                <div className={cn('text-[12px]', note.ok ? 'text-good' : 'text-bad')}>
                  {note.text}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {!form && (
        <div className="flex flex-wrap gap-2">
          <StatsButton disabled={busy} onClick={() => setForm(draft('openai'))}>
            Add a model
          </StatsButton>
          <StatsButton disabled={busy} onClick={() => void detect()}>
            Find models on this PC
          </StatsButton>
        </div>
      )}

      {servers && !form && (
        <div className="flex flex-col gap-2">
          {servers.length === 0 && (
            <p className="m-0 text-[12.5px] text-fg-2">
              Neither Ollama nor LM Studio is running on this PC (ports 11434 and 1234).
            </p>
          )}
          {servers.map((s) => (
            <div key={s.kind} className="flex flex-col gap-1">
              <div className="text-[12.5px] font-medium">
                {s.kind === 'ollama' ? 'Ollama' : 'LM Studio'} · {s.models.length} models
              </div>
              <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
                {s.models.map((m) => (
                  <li key={m.id}>
                    <StatsButton
                      onClick={() => use(s, m)}
                      title={
                        m.tools ? 'Calls tools natively' : 'No native tool calls: structured mode'
                      }
                    >
                      {m.id}
                      <span className="text-[11px] text-fg-3">{m.tools ? 'tools' : 'json'}</span>
                    </StatsButton>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {form && (
        <div
          className="flex flex-col gap-3 rounded-[7px] border border-line px-3 py-3"
          aria-label="Model settings"
        >
          <div className="grid grid-cols-2 gap-3">
            <Field label="Kind">
              <StatsSelect
                title="Kind"
                value={form.kind}
                options={KINDS}
                onChange={(kind) => {
                  setForm({ ...draft(kind), id: form.id })
                  setModels([])
                }}
              />
            </Field>
            {form.kind === 'openai' && (
              <Field label="Service">
                <StatsSelect
                  title="Service"
                  value={form.preset ?? 'custom'}
                  options={SERVICES}
                  onChange={(preset) => {
                    setForm({ ...draft('openai', preset), id: form.id })
                    setModels([])
                  }}
                />
              </Field>
            )}
            <Field label="Address">
              <input
                className={INPUT}
                aria-label="Address"
                value={form.baseUrl}
                onChange={(e) => set({ baseUrl: e.target.value })}
              />
            </Field>
            {!local(form.kind) && (
              <Field label={form.id !== undefined ? 'API key (leave empty to keep it)' : 'API key'}>
                <input
                  className={INPUT}
                  type="password"
                  aria-label="API key"
                  autoComplete="off"
                  value={form.key ?? ''}
                  onChange={(e) => set({ key: e.target.value === '' ? undefined : e.target.value })}
                />
              </Field>
            )}
            <Field label="Model">
              <div className="flex gap-1.5">
                <input
                  className={cn(INPUT, 'min-w-0 flex-1 font-mono')}
                  aria-label="Model"
                  list="ask-models"
                  value={form.model}
                  onChange={(e) => set({ model: e.target.value })}
                />
                <StatsButton disabled={busy} onClick={() => void listModels(form)}>
                  List
                </StatsButton>
              </div>
              <datalist id="ask-models">
                {models.map((m) => (
                  <option key={m.id} value={m.id} />
                ))}
              </datalist>
            </Field>
            <Field label="Tools">
              <StatsSelect<ToolProfile>
                title="Tools"
                value={form.profile}
                options={[
                  { value: 'compact', label: 'Compact (small models)' },
                  { value: 'full', label: 'Full (strong models)' }
                ]}
                onChange={(profile) => set({ profile })}
              />
            </Field>
            <Field label="Calling">
              <StatsSelect<CallingMode>
                title="Calling"
                value={form.mode}
                options={[
                  { value: 'native', label: 'Native tool calls' },
                  { value: 'structured', label: 'Structured JSON' }
                ]}
                onChange={(mode) => set({ mode })}
              />
            </Field>
            <Field label="Reasoning">
              <StatsSelect<Reasoning>
                title="Reasoning"
                value={form.reasoning}
                options={[
                  { value: 'off', label: 'Off (fastest)' },
                  { value: 'low', label: 'Low' },
                  { value: 'high', label: 'High (slowest)' }
                ]}
                onChange={(reasoning) => set({ reasoning })}
              />
            </Field>
          </div>
          <p className="m-0 text-[12px] leading-[1.45] text-fg-3">{LEAVES[form.kind]}</p>
          <div className="flex gap-2">
            <StatsButton
              disabled={busy || !form.model.trim() || !form.baseUrl.trim()}
              onClick={() => void save()}
            >
              Save
            </StatsButton>
            <StatsButton
              disabled={busy}
              onClick={() => {
                setForm(null)
                setModels([])
              }}
            >
              Cancel
            </StatsButton>
          </div>
        </div>
      )}
      {error && <div className="text-[12.5px] text-bad">{error}</div>}
    </section>
  )
}
