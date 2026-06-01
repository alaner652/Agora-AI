/**
 * Provider adapter — the UI never touches a provider's raw API.
 *
 * Each provider exposes `fetchModels(apiKey)` which returns a normalized
 * `ModelOption[]`. Live listing is routed through the existing backend
 * endpoint (`listLLMModels` → POST /api/settings/llm/models) so the browser
 * never hits CORS. On any failure we silently fall back to `knownModels`.
 */

import { listLLMModels } from './data'

export interface ModelOption {
  id: string
  name: string
}

export interface ProviderResult {
  models: ModelOption[]
  fellBack: boolean   // true when live fetch failed and knownModels were used
}

export interface ProviderDef {
  id: string
  label: string
  baseUrl: string
  defaultModel: string
  knownModels: string[]
  /** Whether the API Key field is required for this provider. */
  needsKey: boolean
  /** Whether to attempt a live model fetch (false → always use knownModels). */
  canList: boolean
  fetchModels(apiKey: string): Promise<ProviderResult>
}

function toOptions(ids: string[]): ModelOption[] {
  return ids.map(id => ({ id, name: id }))
}

/** Shared live-list implementation via the backend; falls back to known list. */
async function liveList(baseUrl: string, apiKey: string, known: string[]): Promise<ProviderResult> {
  try {
    const res = await listLLMModels(baseUrl, apiKey)
    if (res.ok && res.models.length > 0) {
      return { models: toOptions(res.models), fellBack: false }
    }
  } catch {
    /* fall through */
  }
  return { models: toOptions(known), fellBack: true }
}

function staticProvider(def: Omit<ProviderDef, 'fetchModels' | 'canList'> & { canList?: false }): ProviderDef {
  return {
    ...def,
    canList: false,
    fetchModels: async () => ({ models: toOptions(def.knownModels), fellBack: false }),
  }
}

function listingProvider(def: Omit<ProviderDef, 'fetchModels' | 'canList'>): ProviderDef {
  return {
    ...def,
    canList: true,
    fetchModels: (apiKey: string) => liveList(def.baseUrl, apiKey, def.knownModels),
  }
}

export const PROVIDERS: ProviderDef[] = [
  staticProvider({
    id: 'gemini',
    label: 'Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    defaultModel: 'gemini-2.0-flash-lite',
    knownModels: ['gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-flash', 'gemini-1.5-pro'],
    needsKey: true,
  }),
  listingProvider({
    id: 'openai',
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    knownModels: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
    needsKey: true,
  }),
  listingProvider({
    id: 'groq',
    label: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'llama-3.3-70b-versatile',
    knownModels: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768', 'gemma2-9b-it'],
    needsKey: true,
  }),
  listingProvider({
    id: 'ollama',
    label: 'Ollama',
    baseUrl: 'http://localhost:11434/v1',
    defaultModel: 'llama3.2',
    knownModels: ['llama3.2', 'llama3.1', 'mistral', 'phi3', 'qwen2.5'],
    needsKey: false,
  }),
  listingProvider({
    id: 'custom',
    label: 'Custom',
    baseUrl: '',
    defaultModel: '',
    knownModels: [],
    needsKey: false,
  }),
]

/** Match a stored base_url back to a provider; falls back to Custom. */
export function providerForBaseUrl(baseUrl: string): ProviderDef {
  return PROVIDERS.find(p => p.baseUrl && p.baseUrl === baseUrl) ?? PROVIDERS[PROVIDERS.length - 1]
}
