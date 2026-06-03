'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getFullSettings, type FullSettingsResponse } from '@/lib/data'
import { Spinner } from '@/components/ui/spinner'
import { SettingCard, InfoRow, CopyButton } from '@/components/settings/primitives'

export default function GeneralSettingsPage() {
  const [data, setData] = useState<FullSettingsResponse | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getFullSettings()
      .then(setData)
      .catch(() => { /* auth 錯誤已由 apiClient 攔截器統一導回登入 */ })
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="flex items-center gap-2 text-muted-foreground text-sm py-6">
      <Spinner /> 載入中…
    </div>
  )
  if (!data) return null

  const { uid, llm_status, settings } = data
  const model = llm_status.has_custom_config ? (llm_status.model || '—') : '伺服器預設'
  const providerHost = llm_status.has_custom_config && llm_status.base_url
    ? (() => { try { return new URL(llm_status.base_url).hostname } catch { return llm_status.base_url } })()
    : '—'

  return (
    <>
      <SettingCard>
        <p className="text-sm font-medium text-foreground">帳號</p>
        <div className="-mt-2">
          <InfoRow label="學號" value={uid} mono action={<CopyButton value={uid} />} />
        </div>
      </SettingCard>

      <SettingCard>
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-foreground">語言模型</p>
          <Link href="/settings/llm" className="text-xs text-primary hover:text-primary/80 transition-colors">
            設定 →
          </Link>
        </div>
        <div className="-mt-2">
          <InfoRow label="狀態" value={llm_status.has_custom_config ? '自訂設定' : '伺服器預設'}
            action={<span className={`w-1.5 h-1.5 rounded-full ${llm_status.has_custom_config ? 'bg-emerald-400' : 'bg-muted-foreground/30'}`} />} />
          <InfoRow label="模型" value={model} mono />
          {llm_status.has_custom_config && <InfoRow label="Provider" value={providerHost} />}
          <InfoRow label="Temperature" value={settings.llm.temperature.toFixed(1)} mono />
          <InfoRow label="Max Tokens" value={settings.llm.max_tokens.toLocaleString()} mono />
          <InfoRow label="Context" value={`${settings.llm.context_length} 輪`} mono />
        </div>
      </SettingCard>
    </>
  )
}
