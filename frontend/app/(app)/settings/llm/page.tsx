import { unstable_rethrow } from 'next/navigation'
import { serverFetch } from '@/lib/api-server'
import { LLMSettingsView } from '@/components/settings/LLMSettingsView'
import type { LLMConfigResponse, FullSettingsResponse } from '@/lib/data'

export default async function LLMSettingsPage() {
  let cfg: LLMConfigResponse
  let full: FullSettingsResponse
  try {
    [cfg, full] = await Promise.all([
      serverFetch<LLMConfigResponse>('/api/settings/llm'),
      serverFetch<FullSettingsResponse>('/api/settings'),
    ])
  } catch (e) {
    unstable_rethrow(e)
    return <p className="text-red-500 text-sm">載入失敗，請重新整理</p>
  }

  return <LLMSettingsView initialConfig={cfg} initialBehaviour={full.settings.llm} />
}
