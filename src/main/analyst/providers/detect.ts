import type { LocalServer, ModelInfo } from '@shared/ask'
import { ollamaModels } from './ollama'
import { LMSTUDIO_BASE_URL, OLLAMA_BASE_URL } from '@shared/askPresets'
import type { Fetch } from './types'

/**
 * Finds the local servers that are running (Ask spec §6.2) and what each model can do, so the calling
 * mode defaults from it (§5.2): a model without tool calls gets structured mode. A server that is not
 * running is skipped quickly and quietly.
 */
const TIMEOUT_MS = 1500

interface LmStudioModel {
  id: string
  type?: string
  capabilities?: string[]
  max_context_length?: number
}

/** LM Studio's models with their capabilities (its own `/api/v0/models`). */
export async function lmStudioModels(
  base: string,
  signal: AbortSignal,
  doFetch: Fetch = fetch
): Promise<ModelInfo[]> {
  const res = await doFetch(`${base}/api/v0/models`, { signal })
  if (!res.ok) throw new Error(`LM Studio answered ${res.status}`)
  const j = (await res.json()) as { data?: LmStudioModel[] }
  return (j.data ?? [])
    .filter((m) => m.type === undefined || m.type === 'llm' || m.type === 'vlm')
    .map((m) => ({
      id: m.id,
      tools: (m.capabilities ?? []).includes('tool_use'),
      thinking: false,
      context: m.max_context_length ?? null
    }))
    .sort((a, b) => a.id.localeCompare(b.id))
}

async function probe(
  kind: LocalServer['kind'],
  baseUrl: string,
  list: (signal: AbortSignal) => Promise<ModelInfo[]>
): Promise<LocalServer | null> {
  const signal = AbortSignal.timeout(TIMEOUT_MS)
  try {
    return { kind, baseUrl, models: await list(signal) }
  } catch {
    return null
  }
}

export async function detectLocalServers(doFetch: Fetch = fetch): Promise<LocalServer[]> {
  const found = await Promise.all([
    probe('ollama', OLLAMA_BASE_URL, (s) => ollamaModels(OLLAMA_BASE_URL, s, doFetch)),
    probe('lmstudio', LMSTUDIO_BASE_URL, (s) => lmStudioModels(LMSTUDIO_BASE_URL, s, doFetch))
  ])
  return found.filter((s): s is LocalServer => s !== null)
}
