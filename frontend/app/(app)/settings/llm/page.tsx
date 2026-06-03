'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  getLLMConfig, setLLMConfig, deleteLLMConfig, testLLMConfig,
  getFullSettings, patchSettings,
  type LLMConfigRequest, type LLMBehaviourSettings,
} from '@/lib/data'
import { PROVIDERS, providerForBaseUrl, type ModelOption, type ProviderDef } from '@/lib/providers'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { SettingCard, SettingCardHeader, FieldLabel, Slider } from '@/components/settings/primitives'

const DEFAULT_BEHAVIOUR: LLMBehaviourSettings = {
  temperature: 0.7, max_tokens: 2048, system_prompt: '', context_length: 20,
}

export default function LLMSettingsPage() {
  // Provider state
  const [hasCustom, setHasCustom] = useState(false)
  const [loading, setLoading] = useState(true)
  const [provider, setProvider] = useState<ProviderDef>(PROVIDERS[0])
  const [baseUrl, setBaseUrl] = useState(PROVIDERS[0].baseUrl)
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState(PROVIDERS[0].defaultModel)
  const [showKey, setShowKey] = useState(false)
  const [models, setModels] = useState<ModelOption[]>([])
  const [modelsLoading, setModelsLoading] = useState(false)
  const [modelsFellBack, setModelsFellBack] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [error, setError] = useState('')

  // Behaviour state
  const [behaviour, setBehaviour] = useState<LLMBehaviourSettings>(DEFAULT_BEHAVIOUR)
  const [bSaving, setBSaving] = useState(false)
  const [bSaved, setBSaved] = useState(false)

  async function loadModels(p: ProviderDef, key: string) {
    setModelsLoading(true)
    setModelsFellBack(false)
    try {
      // Skip live fetch when a key is required but absent — show known list silently
      if (p.canList && p.needsKey && !key) {
        setModels(p.knownModels.map(id => ({ id, name: id })))
        return
      }
      const { models, fellBack } = await p.fetchModels(key)
      setModels(models)
      setModelsFellBack(fellBack)
    } finally {
      setModelsLoading(false)
    }
  }

  useEffect(() => {
    Promise.all([getLLMConfig(), getFullSettings()])
      .then(([cfg, full]) => {
        setHasCustom(cfg.has_custom_config)
        const p = cfg.has_custom_config ? providerForBaseUrl(cfg.base_url) : PROVIDERS[0]
        setProvider(p)
        setBaseUrl(cfg.has_custom_config ? cfg.base_url : p.baseUrl)
        setModel(cfg.has_custom_config ? cfg.model : p.defaultModel)
        setBehaviour(full.settings.llm)
        loadModels(p, '')   // no key on load → falls back to known list
      })
      .catch(() => { /* auth 錯誤已由 apiClient 攔截器統一導回登入 */ })
      .finally(() => setLoading(false))
  }, [])

  function selectProvider(p: ProviderDef) {
    setProvider(p)
    setError('')
    setBaseUrl(p.baseUrl)
    setModel(p.defaultModel)
    loadModels(p, apiKey)
  }

  async function handleSave() {
    if (!baseUrl || !model) { setError('請選擇模型'); return }
    setError(''); setSaving(true)
    try {
      const req: LLMConfigRequest = { base_url: baseUrl, api_key: apiKey, model }
      await setLLMConfig(req)
      setHasCustom(true); setApiKey('')
      toast.success('已儲存模型設定')
    } catch { toast.error('儲存失敗，請重試') } finally { setSaving(false) }
  }

  async function handleDelete() {
    try {
      await deleteLLMConfig()
      setHasCustom(false)
      selectProvider(PROVIDERS[0])
      setApiKey('')
      toast.success('已清除自訂設定，改用伺服器預設')
    } catch { toast.error('清除失敗') }
  }

  async function handleTest() {
    if (!baseUrl || !model) { setError('請先選擇模型'); return }
    setError(''); setTesting(true)
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
      setBehaviour(updated.llm); setBSaved(true)
      setTimeout(() => setBSaved(false), 2000)
    } catch { /* silent */ } finally { setBSaving(false) }
  }

  if (loading) return (
    <div className="flex items-center gap-2 text-muted-foreground text-sm py-6">
      <Spinner />
      載入中…
    </div>
  )

  return (
    <>
      {/* ── Card 1: Provider ──────────────────────────────────────────── */}
      <SettingCard>
        <SettingCardHeader
          title="Provider"
          status={
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className={`w-1.5 h-1.5 rounded-full ${hasCustom ? 'bg-emerald-400' : 'bg-muted-foreground/40'}`} />
              {hasCustom ? '使用自訂設定' : '使用伺服器預設'}
            </span>
          }
        />

        {/* Provider buttons */}
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

        {/* Model selection */}
        <div>
          <FieldLabel>模型</FieldLabel>
          {modelsLoading ? (
            <div className="grid grid-cols-2 gap-1.5">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-9 rounded-lg border border-border bg-muted/20 animate-pulse" />
              ))}
            </div>
          ) : models.length > 0 ? (
            <div className="grid grid-cols-2 gap-1.5">
              {models.map(m => (
                <button key={m.id} onClick={() => setModel(m.id)}
                  className={`text-left px-3 py-2 rounded-lg border text-xs font-mono truncate transition-colors ${
                    model === m.id
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/20'
                  }`}>
                  {m.name}
                </button>
              ))}
            </div>
          ) : null}

          {modelsFellBack && (
            <p className="text-[11px] text-muted-foreground/60 mt-1.5">
              無法取得模型列表，已使用預設模型
            </p>
          )}

          {/* Free-form input — always available */}
          <Input value={model} onChange={e => setModel(e.target.value)}
            placeholder="model-name" className="font-mono text-sm mt-2" />
        </div>

        {/* API Key */}
        <div>
          <FieldLabel>API Key</FieldLabel>
          <div className="relative">
            <Input type={showKey ? 'text' : 'password'} value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder={hasCustom ? '留空則不更改' : (provider.needsKey ? 'sk-…' : '可留空')}
              className="pr-12 text-sm" />
            <button type="button" onClick={() => setShowKey(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground transition-colors">
              {showKey ? '隱藏' : '顯示'}
            </button>
          </div>
        </div>

        {/* Base URL */}
        <div>
          <FieldLabel>Base URL</FieldLabel>
          <Input value={baseUrl}
            onChange={e => { setBaseUrl(e.target.value); setProvider(PROVIDERS[PROVIDERS.length - 1]) }}
            placeholder="https://api.openai.com/v1" className="font-mono text-sm" />
        </div>

        {/* Feedback：欄位驗證留 inline，連線/儲存結果走 toast */}
        {error && <p className="text-xs text-red-400">{error}</p>}

        {/* Actions */}
        <div className="flex items-center gap-2 flex-wrap pt-1">
          <Button size="sm" variant="outline" onClick={handleTest} disabled={testing} className="text-xs">
            {testing ? '測試中…' : '測試連線'}
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving}
            className="text-xs bg-primary hover:bg-primary/80 text-primary-foreground">
            {saving ? '儲存中…' : '儲存'}
          </Button>
          {hasCustom && (
            <button onClick={handleDelete}
              className="text-xs text-muted-foreground hover:text-red-400 transition-colors ml-auto">
              清除自訂
            </button>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground/50">儲存後需重新登入才會生效</p>
      </SettingCard>

      {/* ── Card 2: Behaviour ─────────────────────────────────────────── */}
      <SettingCard>
        <SettingCardHeader title="行為設定" />

        <Slider label="Temperature" value={behaviour.temperature}
          min={0} max={2} step={0.1} format={v => v.toFixed(1)}
          onChange={v => setBehaviour(p => ({ ...p, temperature: v }))} />

        <Slider label="Max Tokens" value={behaviour.max_tokens}
          min={256} max={16384} step={256} format={v => v.toLocaleString()}
          onChange={v => setBehaviour(p => ({ ...p, max_tokens: v }))} />

        <Slider label="Context Length" value={behaviour.context_length}
          min={1} max={50} step={1} format={v => `${v} 輪`}
          onChange={v => setBehaviour(p => ({ ...p, context_length: Math.round(v) }))} />

        <div>
          <FieldLabel>System Prompt</FieldLabel>
          <textarea rows={3} value={behaviour.system_prompt}
            onChange={e => setBehaviour(p => ({ ...p, system_prompt: e.target.value }))}
            placeholder="附加至預設指令之後的個人化提示…"
            className="w-full bg-transparent border border-border rounded-lg px-3 py-2 text-sm
              text-foreground placeholder:text-muted-foreground/40 resize-none
              focus:outline-none focus:ring-1 focus:ring-primary/50" />
        </div>

        <div className="flex items-center gap-3 pt-1">
          <Button size="sm" onClick={handleSaveBehaviour} disabled={bSaving}
            className="text-xs bg-primary hover:bg-primary/80 text-primary-foreground">
            {bSaving ? '儲存中…' : '儲存'}
          </Button>
          {bSaved && <span className="text-xs text-emerald-400">✓ 已儲存</span>}
        </div>
      </SettingCard>
    </>
  )
}
