import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  getLLMConfig,
  setLLMConfig,
  deleteLLMConfig,
  testLLMConfig,
  type LLMConfigRequest,
} from '../api/data'
import { clearToken } from '../api/auth'
import { Button, Spinner } from '../components/ui'

const PROVIDER_PRESETS = [
  { label: 'Google Gemini', base_url: 'https://generativelanguage.googleapis.com/v1beta/openai/', model: 'gemini-2.0-flash-lite' },
  { label: 'OpenAI',        base_url: 'https://api.openai.com/v1',                              model: 'gpt-4o-mini' },
  { label: 'Groq',          base_url: 'https://api.groq.com/openai/v1',                         model: 'llama-3.3-70b-versatile' },
  { label: 'Ollama (自架)', base_url: 'http://localhost:11434/v1',                               model: 'llama3.2' },
  { label: '自訂',          base_url: '',                                                        model: '' },
]

const inputCls = 'w-full bg-zinc-800 border border-zinc-700 text-zinc-100 placeholder:text-zinc-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500'

export default function SettingsPage() {
  const navigate = useNavigate()

  const [currentConfig, setCurrentConfig] = useState<{ has_custom_config: boolean; base_url: string; model: string } | null>(null)
  const [loading, setLoading] = useState(true)

  const [selectedPreset, setSelectedPreset] = useState(0)
  const [baseUrl, setBaseUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState('')
  const [showKey, setShowKey] = useState(false)

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
          setSelectedPreset(matched >= 0 ? matched : PROVIDER_PRESETS.length - 1)
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
    const p = PROVIDER_PRESETS[idx]
    if (p.base_url) setBaseUrl(p.base_url)
    if (p.model) setModel(p.model)
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
      <div className="flex items-center justify-center h-64 gap-2 text-zinc-500 text-sm">
        <Spinner />載入中…
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-8">
      <h1 className="text-xl font-semibold text-zinc-100 mb-1">AI 設定</h1>
      <p className="text-sm text-zinc-500 mb-6">設定您自己的 LLM API。登出後重新登入才會套用新設定。</p>

      {/* Current status */}
      <div className="bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 mb-6 text-sm">
        {currentConfig?.has_custom_config ? (
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
              <span className="font-medium text-zinc-200">使用自訂設定</span>
            </div>
            <div className="text-zinc-500 pl-4">
              <div>URL：{currentConfig.base_url}</div>
              <div>模型：{currentConfig.model}</div>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-zinc-500">
            <span className="w-2 h-2 rounded-full bg-zinc-600 inline-block" />
            使用伺服器預設設定
          </div>
        )}
      </div>

      {/* Provider quick select */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-zinc-300 mb-2">Provider</label>
        <div className="flex flex-wrap gap-2">
          {PROVIDER_PRESETS.map((p, i) => (
            <button
              key={p.label}
              onClick={() => applyPreset(i)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                selectedPreset === i
                  ? 'bg-orange-500 text-white border-orange-500'
                  : 'bg-transparent text-zinc-400 border-zinc-700 hover:border-orange-500 hover:text-orange-400'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-4">
        <label className="block text-sm font-medium text-zinc-300 mb-1">Base URL</label>
        <input type="text" value={baseUrl}
          onChange={e => { setBaseUrl(e.target.value); setSelectedPreset(PROVIDER_PRESETS.length - 1) }}
          placeholder="https://api.openai.com/v1"
          className={inputCls}
        />
      </div>

      <div className="mb-4">
        <label className="block text-sm font-medium text-zinc-300 mb-1">
          API Key
          <span className="ml-1 text-xs text-zinc-600 font-normal">
            {currentConfig?.has_custom_config ? '（留空表示不更改）' : '（Ollama 等自架可留空）'}
          </span>
        </label>
        <div className="relative">
          <input type={showKey ? 'text' : 'password'} value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            placeholder="sk-..."
            className={`${inputCls} pr-14`}
          />
          <button type="button" onClick={() => setShowKey(v => !v)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 text-xs px-1">
            {showKey ? '隱藏' : '顯示'}
          </button>
        </div>
      </div>

      <div className="mb-6">
        <label className="block text-sm font-medium text-zinc-300 mb-1">模型名稱</label>
        <input type="text" value={model}
          onChange={e => setModel(e.target.value)}
          placeholder="gemini-2.0-flash-lite"
          className={inputCls}
        />
      </div>

      {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

      {testResult && (
        <div className={`text-sm mb-4 px-3 py-2 rounded-lg border ${
          testResult.ok
            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
            : 'bg-red-500/10 border-red-500/20 text-red-400'
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

      <p className="text-xs text-zinc-600 mt-6">
        儲存後需重新登入，新的 LLM 設定才會生效。
      </p>
    </div>
  )
}
