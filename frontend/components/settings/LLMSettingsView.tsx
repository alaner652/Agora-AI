'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import {
  setLLMConfig, deleteLLMConfig, testLLMConfig, patchSettings,
  type LLMConfigRequest, type LLMConfigResponse, type LLMBehaviourSettings,
} from '@/lib/data'
import { PROVIDERS, providerForBaseUrl, type ProviderDef } from '@/lib/providers'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SettingCard, SettingCardHeader, FieldLabel, Slider } from '@/components/settings/primitives'

interface LLMSettingsViewProps {
  initialConfig: LLMConfigResponse
  initialBehaviour: LLMBehaviourSettings
}

export function LLMSettingsView({ initialConfig, initialBehaviour }: LLMSettingsViewProps) {
  const initialProvider = initialConfig.has_custom_config
    ? providerForBaseUrl(initialConfig.base_url)
    : PROVIDERS[0]

  const [hasCustom, setHasCustom] = useState(initialConfig.has_custom_config)
  const [provider, setProvider] = useState<ProviderDef>(initialProvider)
  const [baseUrl, setBaseUrl] = useState(initialConfig.has_custom_config ? initialConfig.base_url : initialProvider.baseUrl)
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState(initialConfig.has_custom_config ? initialConfig.model : initialProvider.defaultModel)
  const [showKey, setShowKey] = useState(false)

  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [behaviour, setBehaviour] = useState<LLMBehaviourSettings>(initialBehaviour)
  const [bSaving, setBSaving] = useState(false)

  function selectProvider(p: ProviderDef) {
    setProvider(p)
    setBaseUrl(p.baseUrl)
    setModel(p.defaultModel)
  }

  async function handleSave() {
    if (!baseUrl || !model) { toast.error('請填入模型 ID'); return }
    setSaving(true)
    try {
      const req: LLMConfigRequest = { base_url: baseUrl, api_key: apiKey, model }
      await setLLMConfig(req)
      setHasCustom(true)
      setApiKey('')
      toast.success('已儲存模型設定')
    } catch { toast.error('儲存失敗，請重試') } finally { setSaving(false) }
  }

  async function handleDelete() {
    try {
      await deleteLLMConfig()
      setHasCustom(false)
      selectProvider(PROVIDERS[0])
      setApiKey('')
      toast.success('已清除自訂設定')
    } catch { toast.error('清除失敗') }
  }

  async function handleTest() {
    if (!baseUrl || !model) { toast.error('請先填入模型 ID'); return }
    setTesting(true)
    try {
      const res = await testLLMConfig({ base_url: baseUrl, api_key: apiKey, model })
      if (res.ok) toast.success('連線測試成功', { description: res.reply || undefined })
      else toast.error('連線測試失敗', { description: res.error || undefined })
    } catch { toast.error('連線測試失敗，請求未完成') } finally { setTesting(false) }
  }

  async function handleSaveBehaviour() {
    setBSaving(true)
    try {
      const updated = await patchSettings({ llm: behaviour })
      setBehaviour(updated.llm)
      toast.success('已儲存')
    } catch { toast.error('儲存失敗，請重試') } finally { setBSaving(false) }
  }

  return (
    <>
      {/* ── 模型設定 ──────────────────────────────────────────── */}
      <SettingCard>
        <SettingCardHeader
          title="模型設定"
          description="選擇服務商，填入金鑰與模型 ID 後儲存"
          status={
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
              <span className={`w-1.5 h-1.5 rounded-full ${hasCustom ? 'bg-emerald-400' : 'bg-muted-foreground/40'}`} />
              {hasCustom ? '已設定' : '未設定'}
            </span>
          }
        />

        {/* 服務商 */}
        <div>
          <FieldLabel>服務商</FieldLabel>
          <div className="flex flex-wrap gap-1.5">
            {PROVIDERS.map(p => (
              <button key={p.id} onClick={() => selectProvider(p)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  provider.id === p.id
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                }`}>
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* API 金鑰 */}
        <div>
          <FieldLabel>API 金鑰</FieldLabel>
          <div className="relative">
            <Input type={showKey ? 'text' : 'password'} value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder={hasCustom ? '留空則不更改' : (provider.needsKey ? 'sk-…' : '此服務商不需要金鑰')}
              className="pr-12 text-sm" />
            <button type="button" onClick={() => setShowKey(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground transition-colors">
              {showKey ? '隱藏' : '顯示'}
            </button>
          </div>
        </div>

        {/* 模型 ID */}
        <div>
          <FieldLabel>模型 ID</FieldLabel>
          <Input value={model} onChange={e => setModel(e.target.value)}
            placeholder="例：gpt-4o-mini、gemini-2.0-flash" className="font-mono text-sm" />
        </div>

        {/* 端點網址（進階） */}
        <div>
          <FieldLabel>端點網址（進階）</FieldLabel>
          <Input value={baseUrl}
            onChange={e => { setBaseUrl(e.target.value); setProvider(PROVIDERS[PROVIDERS.length - 1]) }}
            placeholder="https://api.openai.com/v1" className="font-mono text-sm" />
          <p className="text-[11px] text-muted-foreground/50 mt-1.5">
            一般不需要修改；使用自訂代理或相容服務時才填入
          </p>
        </div>

        {/* 操作 */}
        <div className="flex items-center gap-2 flex-wrap pt-1">
          <Button size="sm" variant="outline" onClick={handleTest} disabled={testing} className="text-xs">
            {testing ? '測試中…' : '測試連線'}
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving}
            className="text-xs bg-primary hover:bg-primary/80 text-primary-foreground">
            {saving ? '儲存中…' : '儲存設定'}
          </Button>
          {hasCustom && (
            <button onClick={handleDelete}
              className="text-xs text-muted-foreground hover:text-red-400 transition-colors ml-auto">
              清除設定
            </button>
          )}
        </div>
      </SettingCard>

      {/* ── 對話行為 ─────────────────────────────────────────── */}
      <SettingCard>
        <SettingCardHeader title="對話行為" description="調整 AI 回應的風格與長度" />

        <Slider label="創意度" value={behaviour.temperature}
          min={0} max={2} step={0.1} format={v => v.toFixed(1)}
          hint="數值越高回答越有創意，越低越嚴謹"
          onChange={v => setBehaviour(p => ({ ...p, temperature: v }))} />

        <Slider label="最大回應長度" value={behaviour.max_tokens}
          min={256} max={16384} step={256} format={v => v.toLocaleString()}
          hint="每次回應最多產生的 token 數量"
          onChange={v => setBehaviour(p => ({ ...p, max_tokens: v }))} />

        <Slider label="記憶輪數" value={behaviour.context_length}
          min={1} max={50} step={1} format={v => `${v} 輪`}
          hint="AI 能記住的對話輪數，越多越耗 token"
          onChange={v => setBehaviour(p => ({ ...p, context_length: Math.round(v) }))} />

        <div>
          <FieldLabel>自訂系統提示</FieldLabel>
          <textarea rows={3} value={behaviour.system_prompt}
            onChange={e => setBehaviour(p => ({ ...p, system_prompt: e.target.value }))}
            placeholder="附加在預設指令之後的個人化提示…"
            className="w-full bg-transparent border border-border rounded-lg px-3 py-2 text-sm
              text-foreground placeholder:text-muted-foreground/40 resize-none
              focus:outline-none focus:ring-1 focus:ring-primary/50" />
        </div>

        <div className="pt-1">
          <Button size="sm" onClick={handleSaveBehaviour} disabled={bSaving}
            className="text-xs bg-primary hover:bg-primary/80 text-primary-foreground">
            {bSaving ? '儲存中…' : '儲存'}
          </Button>
        </div>
      </SettingCard>
    </>
  )
}
