'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw } from 'lucide-react'
import {
  getLLMConfig, setLLMConfig, deleteLLMConfig, testLLMConfig, listLLMModels,
  type LLMConfigRequest,
} from '@/lib/data'
import { deleteCookie } from '@/lib/cookie'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const PROVIDER_PRESETS = [
  {
    label: 'Google Gemini',
    base_url: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    model: 'gemini-2.0-flash-lite',
    knownModels: ['gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-flash', 'gemini-1.5-pro'],
  },
  {
    label: 'OpenAI',
    base_url: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    knownModels: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
  },
  {
    label: 'Groq',
    base_url: 'https://api.groq.com/openai/v1',
    model: 'llama-3.3-70b-versatile',
    knownModels: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768', 'gemma2-9b-it'],
  },
  {
    label: 'Ollama',
    base_url: 'http://localhost:11434/v1',
    model: 'llama3.2',
    knownModels: [] as string[],
  },
  {
    label: '自訂',
    base_url: '',
    model: '',
    knownModels: [] as string[],
  },
]

export default function LLMSettingsPage() {
  const router = useRouter()
  const [currentConfig, setCurrentConfig] = useState<{ has_custom_config: boolean; base_url: string; model: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedPreset, setSelectedPreset] = useState(0)
  const [baseUrl, setBaseUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [modelOptions, setModelOptions] = useState<string[]>([])
  const [loadingModels, setLoadingModels] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    getLLMConfig()
      .then(cfg => {
        setCurrentConfig(cfg)
        if (cfg.has_custom_config) {
          setBaseUrl(cfg.base_url)
          setModel(cfg.model)
          const matched = PROVIDER_PRESETS.findIndex(p => p.base_url === cfg.base_url)
          const idx = matched >= 0 ? matched : PROVIDER_PRESETS.length - 1
          setSelectedPreset(idx)
          setModelOptions(PROVIDER_PRESETS[idx].knownModels)
        }
      })
      .catch(e => {
        const code = e?.response?.data?.detail?.error_code
        if (code === 'AUTH_002') { deleteCookie('token'); router.push('/login') }
      })
      .finally(() => setLoading(false))
  }, [router])

  function applyPreset(idx: number) {
    setSelectedPreset(idx)
    setTestResult(null)
    setError('')
    setModelOptions(PROVIDER_PRESETS[idx].knownModels)
    const p = PROVIDER_PRESETS[idx]
    if (p.base_url) setBaseUrl(p.base_url)
    if (p.model) setModel(p.model)
  }

  async function handleLoadModels() {
    if (!baseUrl) return
    setLoadingModels(true)
    setError('')
    try {
      const res = await listLLMModels(baseUrl, apiKey)
      if (res.ok && res.models.length > 0) {
        setModelOptions(res.models)
        if (!res.models.includes(model)) setModel(res.models[0])
      } else {
        setError(res.error?.trim() || '此 Provider 不支援自動取得模型清單')
      }
    } catch {
      setError('無法連線至 Provider，請確認 Base URL 與 API Key')
    } finally {
      setLoadingModels(false)
    }
  }

  async function handleSave() {
    if (!baseUrl || !model) { setError('請填寫 Base URL 和模型名稱'); return }
    setError('')
    setSaving(true)
    try {
      const req: LLMConfigRequest = { base_url: baseUrl, api_key: apiKey, model }
      const updated = await setLLMConfig(req)
      setCurrentConfig({ ...updated })
      setApiKey('')
    } catch {
      setError('儲存失敗，請重試')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!confirm('確定要清除自訂設定，改用伺服器預設？')) return
    try {
      await deleteLLMConfig()
      setCurrentConfig({ has_custom_config: false, base_url: '', model: '' })
      setBaseUrl(''); setApiKey(''); setModel(''); setTestResult(null); setModelOptions([])
    } catch {
      setError('清除失敗，請重試')
    }
  }

  async function handleTest() {
    if (!baseUrl || !model) { setError('請先填寫 Base URL 和模型名稱'); return }
    setError('')
    setTesting(true)
    setTestResult(null)
    try {
      const res = await testLLMConfig({ base_url: baseUrl, api_key: apiKey, model })
      setTestResult({ ok: res.ok, msg: res.ok ? `回應：${res.reply}` : (res.error ?? '未知錯誤') })
    } catch {
      setTestResult({ ok: false, msg: '請求失敗' })
    } finally {
      setTesting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground/70 text-sm py-8">
        <div className="border-2 border-border border-t-primary rounded-full animate-spin w-4 h-4" />
        載入中…
      </div>
    )
  }

  return (
    <div className="max-w-lg space-y-5">
      <div>
        <h2 className="text-base font-semibold text-foreground">LLM 設定</h2>
        <p className="text-xs text-muted-foreground/70 mt-0.5">自訂語言模型 Provider、API Key 與模型名稱</p>
      </div>

      {/* Current config status */}
      <div className={`rounded-xl border px-4 py-3 text-sm ${
        currentConfig?.has_custom_config
          ? 'bg-emerald-500/10 border-emerald-500/30'
          : 'bg-muted/30 border-border'
      }`}>
        {currentConfig?.has_custom_config ? (
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
              <span className="font-medium text-emerald-400">使用自訂設定</span>
            </div>
            <div className="text-muted-foreground pl-4 text-xs space-y-0.5">
              <div>URL：{currentConfig.base_url}</div>
              <div>模型：{currentConfig.model}</div>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-muted-foreground">
            <span className="w-2 h-2 rounded-full bg-muted-foreground/50 inline-block" />
            使用伺服器預設設定
          </div>
        )}
      </div>

      {/* Provider selector */}
      <div>
        <label className="block text-sm font-medium text-foreground/80 mb-2">Provider</label>
        <div className="flex flex-wrap gap-2">
          {PROVIDER_PRESETS.map((p, i) => (
            <button key={p.label} onClick={() => applyPreset(i)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                selectedPreset === i
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-card text-muted-foreground border-border hover:border-primary/40 hover:text-primary'
              }`}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Base URL */}
      <div>
        <label className="block text-sm font-medium text-foreground/80 mb-1">Base URL</label>
        <Input
          type="text"
          value={baseUrl}
          onChange={e => { setBaseUrl(e.target.value); setSelectedPreset(PROVIDER_PRESETS.length - 1) }}
          placeholder="https://api.openai.com/v1"
          className="py-2"
        />
      </div>

      {/* API Key */}
      <div>
        <label className="block text-sm font-medium text-foreground/80 mb-1">
          API Key
          <span className="ml-1.5 text-xs text-muted-foreground/70 font-normal">
            {currentConfig?.has_custom_config ? '（留空表示不更改）' : '（自架 Ollama 可留空）'}
          </span>
        </label>
        <div className="relative">
          <Input
            type={showKey ? 'text' : 'password'}
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            placeholder="sk-..."
            className="pr-14 py-2"
          />
          <button type="button" onClick={() => setShowKey(v => !v)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/70 hover:text-muted-foreground text-xs px-1 transition-colors">
            {showKey ? '隱藏' : '顯示'}
          </button>
        </div>
      </div>

      {/* Model */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-sm font-medium text-foreground/80">模型</label>
          <button type="button" onClick={handleLoadModels} disabled={!baseUrl || loadingModels}
            className="flex items-center gap-1 text-xs text-muted-foreground/70 hover:text-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
            {loadingModels
              ? <div className="border-2 border-border border-t-primary rounded-full animate-spin w-3 h-3" />
              : <RefreshCw className="w-3 h-3" />
            }
            {loadingModels ? '載入中…' : '載入清單'}
          </button>
        </div>
        {modelOptions.length > 0 ? (
          <Select value={model} onValueChange={v => v != null && setModel(v)}>
            <SelectTrigger>
              <SelectValue displayValue={model} placeholder="選擇模型" />
            </SelectTrigger>
            <SelectContent>
              {modelOptions.map(m => (
                <SelectItem key={m} value={m}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Input
            type="text"
            value={model}
            onChange={e => setModel(e.target.value)}
            placeholder="gemini-2.0-flash-lite"
            className="py-2"
          />
        )}
      </div>

      {error && <p className="text-red-600 text-sm">{error}</p>}

      {testResult && (
        <div className={`text-sm px-3 py-2 rounded-lg border ${
          testResult.ok
            ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
            : 'bg-red-50 border-red-200 text-red-600'
        }`}>
          {testResult.ok ? '✓ 連線成功 — ' : '✗ 連線失敗 — '}
          {testResult.msg}
        </div>
      )}

      <div className="flex gap-3 flex-wrap pt-1">
        <Button variant="outline" onClick={handleTest} disabled={testing}>
          {testing ? '測試中…' : '測試連線'}
        </Button>
        <Button onClick={handleSave} disabled={saving}
          className="bg-primary hover:bg-primary/80 text-primary-foreground">
          {saving ? '儲存中…' : '儲存設定'}
        </Button>
        {currentConfig?.has_custom_config && (
          <Button variant="ghost" onClick={handleDelete}
            className="text-red-500 hover:text-red-600 hover:bg-red-50">
            清除自訂
          </Button>
        )}
      </div>

      <p className="text-xs text-muted-foreground/70">儲存後需重新登入，新的 LLM 設定才會生效。</p>
    </div>
  )
}
