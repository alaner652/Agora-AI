import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  getLLMConfig,
  setLLMConfig,
  deleteLLMConfig,
  testLLMConfig,
  listLLMModels,
  type LLMConfigRequest,
} from '../api/data'
import { clearToken } from '../api/auth'
import { Button, Input, Spinner } from '../components/ui'
import { PageShell } from '../components/PageShell'

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
    label: 'Ollama (自架)',
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

export default function SettingsPage() {
  const navigate = useNavigate()

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
        if (code === 'AUTH_002') { clearToken(); navigate('/login') }
      })
      .finally(() => setLoading(false))
  }, [navigate])

  function applyPreset(idx: number) {
    setSelectedPreset(idx)
    setTestResult(null)
    setModelOptions(PROVIDER_PRESETS[idx].knownModels)
    const p = PROVIDER_PRESETS[idx]
    if (p.base_url) setBaseUrl(p.base_url)
    if (p.model) setModel(p.model)
  }

  async function handleLoadModels() {
    if (!baseUrl) return
    setLoadingModels(true)
    try {
      const res = await listLLMModels(baseUrl, apiKey)
      if (res.ok && res.models.length > 0) {
        setModelOptions(res.models)
      } else {
        const errMsg = res.error?.trim() || '此 Provider 不支援自動取得模型清單'
        setError(errMsg)
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
      setBaseUrl(''); setApiKey(''); setModel(''); setTestResult(null)
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
      <div className="flex items-center justify-center h-64 gap-2 text-stone-500 text-sm">
        <Spinner />載入中…
      </div>
    )
  }

  return (
    <PageShell title="AI 設定">
      <div className="max-w-lg">
        <p className="text-sm text-stone-500 mb-6">設定您自己的 LLM API。登出後重新登入才會套用新設定。</p>

        {/* Current status */}
        <div className="bg-white border border-stone-200 rounded-xl px-4 py-3 mb-6 text-sm">
          {currentConfig?.has_custom_config ? (
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                <span className="font-medium text-stone-800">使用自訂設定</span>
              </div>
              <div className="text-stone-500 pl-4">
                <div>URL：{currentConfig.base_url}</div>
                <div>模型：{currentConfig.model}</div>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-stone-500">
              <span className="w-2 h-2 rounded-full bg-stone-300 inline-block" />
              使用伺服器預設設定
            </div>
          )}
        </div>

        {/* Provider quick select */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-stone-700 mb-2">Provider</label>
          <div className="flex flex-wrap gap-2">
            {PROVIDER_PRESETS.map((p, i) => (
              <button
                key={p.label}
                onClick={() => applyPreset(i)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  selectedPreset === i
                    ? 'bg-orange-500 text-white border-orange-500'
                    : 'bg-white text-stone-600 border-stone-300 hover:border-orange-400 hover:text-orange-500'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-stone-700 mb-1">Base URL</label>
          <Input
            type="text"
            value={baseUrl}
            onChange={e => { setBaseUrl(e.target.value); setSelectedPreset(PROVIDER_PRESETS.length - 1) }}
            placeholder="https://api.openai.com/v1"
            className="py-2"
          />
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-stone-700 mb-1">
            API Key
            <span className="ml-1 text-xs text-stone-400 font-normal">
              {currentConfig?.has_custom_config ? '（留空表示不更改）' : '（Ollama 等自架可留空）'}
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
              className="absolute right-2 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 text-xs px-1 transition-colors">
              {showKey ? '隱藏' : '顯示'}
            </button>
          </div>
        </div>

        <div className="mb-6">
          <div className="flex items-center justify-between mb-1">
            <label className="block text-sm font-medium text-stone-700">模型名稱</label>
            <button
              type="button"
              onClick={handleLoadModels}
              disabled={!baseUrl || loadingModels}
              className="flex items-center gap-1 text-xs text-stone-400 hover:text-orange-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {loadingModels ? <Spinner className="w-3 h-3" /> : (
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              )}
              {loadingModels ? '載入中…' : '載入模型清單'}
            </button>
          </div>
          <input
            type="text"
            list="model-datalist"
            value={model}
            onChange={e => setModel(e.target.value)}
            placeholder="gemini-2.0-flash-lite"
            className="w-full bg-stone-50 border border-stone-300 text-stone-900 placeholder:text-stone-400 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400/50"
          />
          {modelOptions.length > 0 && (
            <datalist id="model-datalist">
              {modelOptions.map(id => <option key={id} value={id} />)}
            </datalist>
          )}
        </div>

        {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

        {testResult && (
          <div className={`text-sm mb-4 px-3 py-2 rounded-lg border ${
            testResult.ok
              ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
              : 'bg-red-50 border-red-200 text-red-600'
          }`}>
            {testResult.ok ? '✓ 連線成功 — ' : '✗ 連線失敗 — '}
            {testResult.msg}
          </div>
        )}

        <div className="flex gap-3 flex-wrap">
          <Button variant="secondary" onClick={handleTest} loading={testing}>
            {testing ? '測試中…' : '測試連線'}
          </Button>
          <Button onClick={handleSave} loading={saving}>
            {saving ? '儲存中…' : '儲存設定'}
          </Button>
          {currentConfig?.has_custom_config && (
            <Button variant="danger" onClick={handleDelete}>清除自訂</Button>
          )}
        </div>

        <p className="text-xs text-stone-400 mt-6">
          儲存後需重新登入，新的 LLM 設定才會生效。
        </p>
      </div>
    </PageShell>
  )
}
