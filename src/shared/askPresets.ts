import type { ProviderPreset } from './ask'

/**
 * The OpenAI-compatible presets (Ask spec §6.2, §14 point 4). Free tiers change their limits and
 * models, so a preset is only a starting base URL: every field stays editable (§13).
 */
export interface Preset {
  label: string
  baseUrl: string
  /** Where the key is made and the usage is shown (the app keeps no price table, §6.2). */
  dashboard: string | null
  free: boolean
}

export const PRESETS: Record<ProviderPreset, Preset> = {
  openai: {
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    dashboard: 'https://platform.openai.com/usage',
    free: false
  },
  gemini: {
    label: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    dashboard: 'https://aistudio.google.com/apikey',
    free: true
  },
  groq: {
    label: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    dashboard: 'https://console.groq.com/keys',
    free: true
  },
  openrouter: {
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    dashboard: 'https://openrouter.ai/settings/keys',
    free: true
  },
  mistral: {
    label: 'Mistral',
    baseUrl: 'https://api.mistral.ai/v1',
    dashboard: 'https://console.mistral.ai/api-keys',
    free: false
  },
  custom: { label: 'Custom', baseUrl: '', dashboard: null, free: false }
}

export const ANTHROPIC_BASE_URL = 'https://api.anthropic.com'
export const ANTHROPIC_DASHBOARD = 'https://console.anthropic.com/settings/usage'
export const OLLAMA_BASE_URL = 'http://localhost:11434'
export const LMSTUDIO_BASE_URL = 'http://localhost:1234'
