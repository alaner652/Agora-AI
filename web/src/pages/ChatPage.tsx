import { useState, useRef, useEffect } from 'react'
import { getToken, clearToken } from '../api/auth'
import { useNavigate } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Spinner } from '../components/ui'

interface ToolRecord { name: string; ok: boolean | null }

interface TextMessage {
  role: 'user' | 'assistant'
  content: string
  toolCalls?: ToolRecord[]
  images?: string[]
  aborted?: boolean
}

interface AskUserState {
  question: string
  options: string[]
  tool_call_id: string
}

// ── Persistence ───────────────────────────────────────────────────────────────

function slimMessages(messages: TextMessage[]): object[] {
  return messages.map(({ images: _, ...rest }) => ({
    ...rest,
    toolCalls: rest.toolCalls?.filter(t => t.ok !== null),
  }))
}

async function loadHistoryFromServer(token: string): Promise<TextMessage[]> {
  try {
    const res = await fetch('/api/history', { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) return []
    const data = await res.json()
    return (data.messages ?? []) as TextMessage[]
  } catch { return [] }
}

async function saveHistoryToServer(token: string, messages: TextMessage[]): Promise<void> {
  try {
    await fetch('/api/history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ messages: slimMessages(messages) }),
    })
  } catch { /* ignore */ }
}

async function clearHistoryOnServer(token: string): Promise<void> {
  try {
    await fetch('/api/history', { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
  } catch { /* ignore */ }
}

async function fetchRenderedImage(imageType: string, token: string): Promise<string | null> {
  try {
    const res = await fetch(`/api/image/${imageType}`, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) return null
    return URL.createObjectURL(await res.blob())
  } catch { return null }
}

async function* streamSse(url: string, body: object, signal: AbortSignal): AsyncGenerator<Record<string, unknown>> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })
  if (!res.ok || !res.body) {
    const detail = await res.json().catch(() => ({}))
    throw Object.assign(new Error('SSE failed'), { detail })
  }
  const reader = res.body.getReader()
  const dec = new TextDecoder()
  let buf = ''
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buf += dec.decode(value, { stream: true })
    const lines = buf.split('\n')
    buf = lines.pop() ?? ''
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try { yield JSON.parse(line.slice(6)) } catch { /* skip */ }
      }
    }
  }
}

// ── UI atoms ──────────────────────────────────────────────────────────────────

const TOOL_LABELS: Record<string, string> = {
  get_semester_options: '取得學期清單', get_schedule: '查詢課表',
  get_absence: '查詢缺曠', get_absence_options: '取得缺曠選項',
  get_grades: '查詢成績', get_leaves: '查詢假單',
  apply_leave: '申請假單', delete_leave: '刪除假單',
  render_image: '產生圖表', ask_user: '詢問使用者',
}

function ThinkingDots() {
  return (
    <div className="flex items-center gap-1 py-1">
      {[0, 150, 300].map(d => (
        <span
          key={d}
          className="w-1.5 h-1.5 rounded-full bg-stone-500 animate-bounce"
          style={{ animationDelay: `${d}ms` }}
        />
      ))}
    </div>
  )
}

function LiveToolPanel({ calls }: { calls: ToolRecord[] }) {
  return (
    <div className="space-y-1.5 py-0.5">
      {calls.map((tc, i) => (
        <div key={i} className="flex items-center gap-2 text-xs text-stone-500">
          {tc.ok === null ? (
            <Spinner className="w-3 h-3 shrink-0 text-stone-500" />
          ) : tc.ok ? (
            <span className="text-emerald-500 shrink-0">✓</span>
          ) : (
            <span className="text-red-400 shrink-0">✗</span>
          )}
          <span className={!tc.ok && tc.ok !== null ? 'text-red-400' : ''}>
            {TOOL_LABELS[tc.name] ?? tc.name}
          </span>
        </div>
      ))}
    </div>
  )
}

function DoneToolPanel({ calls }: { calls: ToolRecord[] }) {
  const [open, setOpen] = useState(false)
  if (calls.length === 0) return null
  return (
    <div className="mt-2 text-xs">
      <button
        onClick={() => setOpen(v => !v)}
        className="text-stone-600 hover:text-stone-400 flex items-center gap-1.5 transition-colors"
      >
        <svg
          className={`w-3 h-3 transition-transform ${open ? 'rotate-90' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        已使用 {calls.length} 個工具
      </button>
      {open && (
        <div className="mt-1 space-y-1 pl-4">
          {calls.map((tc, i) => (
            <div key={i} className="flex items-center gap-2 text-stone-500">
              <span className={`w-1 h-1 rounded-full shrink-0 ${tc.ok ? 'bg-emerald-500' : 'bg-red-500'}`} />
              {TOOL_LABELS[tc.name] ?? tc.name}
              {!tc.ok && <span className="text-red-400 ml-auto">失敗</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const mdComponents = {
  p: ({ children }: { children?: React.ReactNode }) =>
    <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
  ul: ({ children }: { children?: React.ReactNode }) =>
    <ul className="list-disc pl-4 mb-2 space-y-0.5">{children}</ul>,
  ol: ({ children }: { children?: React.ReactNode }) =>
    <ol className="list-decimal pl-4 mb-2 space-y-0.5">{children}</ol>,
  li: ({ children }: { children?: React.ReactNode }) => <li>{children}</li>,
  strong: ({ children }: { children?: React.ReactNode }) =>
    <strong className="font-semibold text-zinc-100">{children}</strong>,
  h1: ({ children }: { children?: React.ReactNode }) =>
    <h1 className="font-semibold text-base mb-1.5 mt-3 text-zinc-100">{children}</h1>,
  h2: ({ children }: { children?: React.ReactNode }) =>
    <h2 className="font-semibold mb-1 mt-2.5 text-zinc-100">{children}</h2>,
  h3: ({ children }: { children?: React.ReactNode }) =>
    <h3 className="font-semibold mb-1 mt-2 text-zinc-200">{children}</h3>,
  code: ({ inline, children }: { inline?: boolean; children?: React.ReactNode }) =>
    inline
      ? <code className="bg-zinc-700 px-1.5 py-0.5 rounded text-xs font-mono text-orange-300">{children}</code>
      : <code className="block bg-zinc-900 border border-zinc-700 rounded-lg p-3 overflow-x-auto text-xs font-mono mb-2 whitespace-pre text-zinc-300">{children}</code>,
  pre: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  img: ({ src, alt }: { src?: string; alt?: string }) =>
    src ? <img src={src} alt={alt ?? ''} className="max-w-full rounded-lg mt-2" /> : null,
  table: ({ children }: { children?: React.ReactNode }) => (
    <div className="overflow-x-auto mb-2">
      <table className="text-xs border-collapse w-full">{children}</table>
    </div>
  ),
  th: ({ children }: { children?: React.ReactNode }) => (
    <th className="border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-left font-medium text-zinc-400">{children}</th>
  ),
  td: ({ children }: { children?: React.ReactNode }) => (
    <td className="border border-zinc-700 px-2 py-1.5 text-zinc-300">{children}</td>
  ),
}

// ── Suggestions shown on empty state ─────────────────────────────────────────

const SUGGESTIONS = [
  '查詢本學期課表',
  '最近的成績怎麼樣？',
  '本月有哪些缺曠？',
  '幫我申請明天的病假',
]

// ── Main Component ────────────────────────────────────────────────────────────

export default function ChatPage() {
  const [messages, setMessages] = useState<TextMessage[]>([])
  const [historyLoaded, setHistoryLoaded] = useState(false)
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [askUser, setAskUser] = useState<AskUserState | null>(null)
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [editText, setEditText] = useState('')
  const [uploadedFile, setUploadedFile] = useState<{ path: string; name: string } | null>(null)
  const [uploading, setUploading] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const editRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()

  useEffect(() => {
    const token = getToken()
    if (!token) { navigate('/login'); return }
    loadHistoryFromServer(token).then(msgs => {
      setMessages(msgs)
      setHistoryLoaded(true)
    })
  }, [])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, streaming])
  useEffect(() => { if (editingIndex !== null) editRef.current?.focus() }, [editingIndex])

  function handleSessionExpired() {
    clearToken()
    setMessages(prev => [...prev, { role: 'assistant', content: 'Session 已過期，即將跳轉至登入頁面...' }])
    setTimeout(() => navigate('/login'), 1500)
  }

  async function runStream(url: string, body: object) {
    const ac = new AbortController()
    abortRef.current = ac
    setStreaming(true)
    setAskUser(null)

    let assistantText = ''
    const toolCalls: ToolRecord[] = []
    const images: string[] = []
    let pendingToolName = ''

    setMessages(prev => [...prev, { role: 'assistant', content: '', toolCalls: [], images: [] }])

    function updateLast(patch: Partial<TextMessage>) {
      setMessages(prev => {
        const next = [...prev]
        next[next.length - 1] = { ...next[next.length - 1], ...patch }
        return next
      })
    }

    let finalMessages: TextMessage[] = []

    try {
      for await (const event of streamSse(url, body, ac.signal)) {
        if (event.type === 'text_delta') {
          assistantText += String(event.text ?? '')
          updateLast({ content: assistantText })
        } else if (event.type === 'tool_call') {
          pendingToolName = String(event.name ?? '')
          toolCalls.push({ name: pendingToolName, ok: null })
          updateLast({ toolCalls: [...toolCalls] })
        } else if (event.type === 'tool_result') {
          const ok = Boolean(event.ok)
          const dataStr = String(event.data ?? '')
          const lastTool = toolCalls.findLast(t => t.name === pendingToolName && t.ok === null)
          if (lastTool) lastTool.ok = ok

          if (!ok) {
            try {
              const parsed = JSON.parse(dataStr)
              if (parsed?.error_code === 'NET_002') { handleSessionExpired(); return }
            } catch { /* not JSON */ }
          } else if (pendingToolName === 'render_image') {
            try {
              const parsed = JSON.parse(dataStr)
              if (parsed?.type) {
                const token = getToken()
                if (token) {
                  const imgUrl = await fetchRenderedImage(parsed.type as string, token)
                  if (imgUrl) { images.push(imgUrl); updateLast({ images: [...images] }) }
                }
              }
            } catch { /* not JSON */ }
          }

          updateLast({ toolCalls: [...toolCalls] })
          pendingToolName = ''
        } else if (event.type === 'ask_user') {
          setAskUser({
            question: String(event.question ?? ''),
            options: (event.options as string[]) ?? [],
            tool_call_id: String(event.tool_call_id ?? ''),
          })
        }
      }
      setMessages(prev => { finalMessages = prev; return prev })
    } catch (err: unknown) {
      if ((err as DOMException).name === 'AbortError') {
        if (pendingToolName) {
          const lastTool = toolCalls.findLast(t => t.name === pendingToolName && t.ok === null)
          if (lastTool) lastTool.ok = false
        }
        updateLast({ toolCalls: [...toolCalls], aborted: true })
        return
      }
      const detail = (err as { detail?: { error_code?: string } }).detail
      if (detail?.error_code === 'AUTH_002' || detail?.error_code === 'NET_002') {
        handleSessionExpired(); return
      }
      updateLast({ content: assistantText || '發生錯誤，請稍後再試。' })
    } finally {
      setStreaming(false)
      const token = getToken()
      if (token && finalMessages.length > 0) saveHistoryToServer(token, finalMessages)
    }
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const token = getToken()
    if (!token) return
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      })
      if (res.ok) {
        const data = await res.json()
        setUploadedFile({ path: data.path, name: data.name })
      }
    } catch { /* ignore */ } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  async function handleSend(e: { preventDefault(): void }) {
    e.preventDefault()
    if (!input.trim() || streaming) return
    const token = getToken()
    if (!token) { navigate('/login'); return }
    let userMsg = input.trim()
    if (uploadedFile) userMsg += `\n\n（附件路徑：${uploadedFile.path}）`
    setInput('')
    setUploadedFile(null)
    setMessages(prev => [...prev, {
      role: 'user',
      content: uploadedFile ? `${input.trim()}\n📎 ${uploadedFile.name}` : userMsg,
    }])
    await runStream('/chat', { token, message: userMsg })
  }

  function sendSuggestion(text: string) {
    setInput(text)
    inputRef.current?.focus()
  }

  async function handleAnswer(selected: string) {
    const token = getToken()
    if (!token) { navigate('/login'); return }
    setAskUser(null)
    setMessages(prev => [...prev, { role: 'user', content: `▶ ${selected}` }])
    await runStream('/answer', { token, selected })
  }

  async function handleClearHistory() {
    const token = getToken()
    if (token) await clearHistoryOnServer(token)
    setMessages([])
  }

  function startEdit(index: number) {
    if (streaming) return
    setEditingIndex(index)
    setEditText(messages[index].content)
  }

  function cancelEdit() { setEditingIndex(null); setEditText('') }

  async function submitEdit() {
    if (!editText.trim() || editingIndex === null || streaming) return
    const token = getToken()
    if (!token) { navigate('/login'); return }
    const newMsg = editText.trim()
    setMessages(prev => [...prev.slice(0, editingIndex), { role: 'user', content: newMsg }])
    setEditingIndex(null)
    setEditText('')
    await runStream('/chat', { token, message: newMsg })
  }

  const lastIdx = messages.length - 1
  const isEmpty = historyLoaded && messages.length === 0 && !streaming

  return (
    <div className="flex flex-col h-screen md:h-dvh">

      {/* ── Top bar ── */}
      <div className="shrink-0 border-b border-stone-700 bg-stone-900 px-4 sm:px-6 py-3 flex items-center justify-between">
        <h1 className="text-sm font-semibold text-zinc-100">AI 助理</h1>
        {messages.length > 0 && !streaming && (
          <button
            onClick={handleClearHistory}
            className="text-xs text-stone-500 hover:text-stone-300 transition-colors"
          >
            清除對話
          </button>
        )}
      </div>

      {/* ── Message list ── */}
      <div className="flex-1 overflow-y-auto">
        {!historyLoaded && (
          <div className="flex items-center justify-center h-full gap-2 text-zinc-600 text-sm">
            <Spinner />載入歷史中...
          </div>
        )}

        {isEmpty && (
          <div className="flex flex-col items-center justify-center h-full px-6 pb-16">
            <p className="text-sm text-stone-500 mb-5 text-center">詢問課表、成績、缺曠、請假等問題</p>
            <div className="grid grid-cols-2 gap-2 w-full max-w-xs">
              {SUGGESTIONS.map(s => (
                <button
                  key={s}
                  onClick={() => sendSuggestion(s)}
                  className="text-left text-xs text-stone-400 bg-stone-800 hover:bg-stone-700 border border-stone-700 rounded-lg px-3 py-2 transition-colors leading-snug"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {!isEmpty && (
          <div className="py-6 px-4 md:px-6 space-y-5 max-w-3xl mx-auto">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {/* Message content */}
                <div className={`${m.role === 'user' ? 'max-w-[75%]' : 'flex-1 min-w-0'}`}>
                  {m.role === 'user' ? (
                    editingIndex === i ? (
                      <div className="flex flex-col gap-2">
                        <textarea
                          ref={editRef}
                          value={editText}
                          onChange={e => setEditText(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitEdit() }
                            if (e.key === 'Escape') cancelEdit()
                          }}
                          rows={3}
                          className="w-full bg-zinc-800 border border-zinc-600 text-zinc-100 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-orange-500/50"
                        />
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={cancelEdit}
                            className="text-xs text-zinc-500 hover:text-zinc-300 px-3 py-1.5 rounded-lg border border-zinc-700 hover:bg-zinc-800 transition-colors"
                          >
                            取消
                          </button>
                          <button
                            onClick={submitEdit}
                            disabled={!editText.trim()}
                            className="text-xs bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white px-3 py-1.5 rounded-lg transition-colors"
                          >
                            重新送出
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="group relative">
                        {!streaming && (
                          <button
                            onClick={() => startEdit(i)}
                            className="absolute -left-7 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity text-zinc-600 hover:text-zinc-400 p-1"
                            title="編輯"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                        )}
                        <div className="bg-orange-500 text-white rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap">
                          {m.content}
                        </div>
                      </div>
                    )
                  ) : (
                    /* Assistant message */
                    i === lastIdx && streaming && m.content === '' && !askUser ? (
                      (m.toolCalls ?? []).length > 0
                        ? <LiveToolPanel calls={m.toolCalls!} />
                        : <ThinkingDots />
                    ) : (
                      <div>
                        {streaming && i === lastIdx && m.content === '' && (m.toolCalls ?? []).length > 0 && (
                          <div className="mb-2"><LiveToolPanel calls={m.toolCalls!} /></div>
                        )}
                        {m.content && (
                          <div className="text-sm leading-relaxed text-zinc-300">
                            <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents as never}>
                              {m.content}
                            </ReactMarkdown>
                          </div>
                        )}
                        {(m.images ?? []).map((uri, j) => (
                          <img key={j} src={uri} alt="圖表" className="max-w-full rounded-lg mt-2" />
                        ))}
                        {m.aborted && (
                          <p className="text-xs text-zinc-600 mt-1 italic">（已中斷）</p>
                        )}
                        {!(streaming && i === lastIdx) && (m.toolCalls ?? []).length > 0 && (
                          <DoneToolPanel calls={m.toolCalls!} />
                        )}
                      </div>
                    )
                  )}
                </div>
              </div>
            ))}

            {askUser && (
              <div className="flex justify-start">
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 max-w-sm">
                  <p className="text-sm text-zinc-200 mb-3">{askUser.question}</p>
                  <div className="space-y-1.5">
                    {askUser.options.map(opt => (
                      <button
                        key={opt}
                        onClick={() => handleAnswer(opt)}
                        className="w-full text-left text-sm bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 rounded-lg px-3 py-2 transition-colors"
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* ── Input bar ── */}
      <div className="shrink-0 border-t border-stone-700 bg-stone-900">
        <div className="max-w-3xl mx-auto px-4 py-3">
          {/* Uploaded file chip */}
          {uploadedFile && (
            <div className="flex items-center gap-2 mb-2">
              <span className="inline-flex items-center gap-1.5 text-xs text-zinc-300 bg-zinc-800 border border-zinc-700 rounded-lg px-2.5 py-1">
                <svg className="w-3.5 h-3.5 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                </svg>
                {uploadedFile.name}
                <button
                  onClick={() => setUploadedFile(null)}
                  className="text-zinc-600 hover:text-zinc-300 ml-0.5 transition-colors"
                >✕</button>
              </span>
            </div>
          )}

          <form onSubmit={handleSend} className="flex gap-2 items-end">
            {/* File upload */}
            <input ref={fileInputRef} type="file" className="hidden" accept="image/*,.pdf" onChange={handleFileSelect} />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={streaming || uploading}
              title="上傳附件"
              className="h-9 w-9 flex items-center justify-center rounded-lg border border-zinc-700 text-zinc-500 hover:text-zinc-300 hover:border-zinc-600 hover:bg-zinc-800 disabled:opacity-40 transition-colors shrink-0"
            >
              {uploading
                ? <Spinner className="w-4 h-4" />
                : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                  </svg>
                )
              }
            </button>

            {/* Text input */}
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="輸入訊息..."
              disabled={streaming || !!askUser || editingIndex !== null}
              className="flex-1 h-9 bg-zinc-800 border border-zinc-700 text-zinc-100 placeholder:text-zinc-500
                rounded-lg px-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/50 disabled:opacity-50"
            />

            {/* Send / Stop */}
            {streaming ? (
              <button
                type="button"
                onClick={() => abortRef.current?.abort()}
                className="h-9 px-4 bg-zinc-700 hover:bg-zinc-600 border border-zinc-600 text-zinc-300 rounded-lg text-sm font-medium transition-colors shrink-0"
              >
                停止
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim() || !!askUser || editingIndex !== null}
                className="h-9 px-4 bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white rounded-lg text-sm font-medium transition-colors shrink-0"
              >
                送出
              </button>
            )}
          </form>

        </div>
      </div>

    </div>
  )
}
