import type { ModelInfo, ProviderInput, ProviderSettings } from '@shared/ask'
import { anthropic } from './anthropic'
import { ollama, ollamaModel } from './ollama'
import { openAiCompatible } from './openaiCompatible'
import { PRESETS } from '@shared/askPresets'
import type { Fetch, Provider } from './types'

/**
 * A provider from its settings (Ask spec §6.2). The key is passed in decrypted for this request only;
 * Ollama models are looked up for their capabilities, so `think` and `tools` are only sent to a model
 * that takes them.
 */
export type ProviderSpec = Pick<
  ProviderSettings | ProviderInput,
  'kind' | 'preset' | 'baseUrl' | 'model' | 'profile'
>

/** The context Ollama loads a model with: the full profile's tools need room (spec §3.2). */
export const OLLAMA_CONTEXT = { compact: 8192, full: 32768 } as const

export async function createProvider(
  s: ProviderSpec,
  key: string | null,
  doFetch: Fetch = fetch
): Promise<Provider> {
  const base = s.baseUrl.replace(/\/+$/, '')
  switch (s.kind) {
    case 'anthropic':
      if (!key) throw new Error('Add your Anthropic API key first.')
      return anthropic({ model: s.model, key, ...(base ? { baseUrl: base } : {}), fetch: doFetch })
    case 'openai':
      return openAiCompatible({
        name: PRESETS[s.preset ?? 'custom'].label,
        baseUrl: base,
        model: s.model,
        key,
        reasoning: true,
        fetch: doFetch
      })
    case 'lmstudio':
      return openAiCompatible({
        name: 'LM Studio',
        baseUrl: `${base}/v1`,
        model: s.model,
        key: null,
        reasoning: false,
        fetch: doFetch
      })
    case 'ollama': {
      let info: ModelInfo | null = null
      try {
        info = await ollamaModel(base, s.model, AbortSignal.timeout(5000), doFetch)
      } catch {
        // Not running: the call itself says so.
      }
      return ollama({
        baseUrl: base,
        model: s.model,
        info,
        context: OLLAMA_CONTEXT[s.profile],
        fetch: doFetch
      })
    }
  }
}
