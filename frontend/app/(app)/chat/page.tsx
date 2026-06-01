'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Bot, Paperclip, Send, Square, ChevronRight, History, LayoutGrid } from 'lucide-react'
import { getCookie, deleteCookie } from '@/lib/cookie'
import { SessionHistoryPanel } from '@/components/SessionHistoryPanel'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { ToolRecord, TextMessage, Attachment } from '@/lib/data'
import { newSession } from '@/lib/data'

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

interface AskUserState {
  question: string
  options: string[]
  tool_call_id: string
}

function slimMessages(messages: TextMessage[]): object[] {
  return messages.map(({ images: _, attachmentPreview: __, ...rest }) => ({
    ...rest,
    toolCalls: rest.toolCalls?.filter(t => t.ok !== null),
  }))
}

async function loadHistoryFromServer(token: string): Promise<TextMessage[] | null> {
  try {
    const res = await fetch(`${BASE}/api/history`, { headers: { Authorization: `Bearer ${token}` } })
    if (res.status === 401) return null
    if (!res.ok) return []
    const data = await res.json()
    return (data.messages ?? []) as TextMessage[]
  } catch { return [] }
}

async function saveHistoryToServer(token: string, messages: TextMessage[]): Promise<void> {
  try {
    await fetch(`${BASE}/api/history`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ messages: slimMessages(messages) }),
    })
  } catch { /* ignore */ }
}

async function clearHistoryOnServer(token: string): Promise<void> {
  try {
    await fetch(`${BASE}/api/history`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
  } catch { /* ignore */ }
}

async function fetchRenderedImage(imageType: string, token: string): Promise<string | null> {
  try {
    const res = await fetch(`${BASE}/api/image/${imageType}`, { headers: { Authorization: `Bearer ${token}` } })
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
    const body = await res.json().catch(() => ({}))
    throw Object.assign(new Error('SSE failed'), { detail: body?.detail ?? body })
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

const TOOL_LABELS: Record<string, string> = {
  get_current_date: '取得目前時間',
  get_semester_options: '取得學期清單',
  fetch_schedule: '查詢課表',
  fetch_absence: '查詢缺曠',
  fetch_grades: '查詢成績',
  get_leaves: '查詢假單',
  get_leave_form: '取得假單選項',
  apply_leave: '申請假單',
  delete_leave: '刪除假單',
  render_image: '產生圖表',
  ask_user: '詢問使用者',
}

const SUGGESTIONS = [
  { text: '查詢本學期課表', sub: '瀏覽今學期所有課程' },
  { text: '最近成績怎麼樣？', sub: '查看歷年成績紀錄' },
  { text: '本月有哪些缺曠？', sub: '確認出勤紀錄' },
  { text: '幫我申請病假', sub: '線上請假申請' },
]

function ThinkingDots() {
  return (
    <div className="flex items-center gap-1.5 py-2 px-1">
      {[0, 150, 300].map(d => (
        <span key={d} className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-bounce"
          style={{ animationDelay: `${d}ms` }} />
      ))}
    </div>
  )
}

function LiveToolPanel({ calls }: { calls: ToolRecord[] }) {
  return (
    <div className="space-y-1.5 py-1">
      {calls.map((tc, i) => (
        <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
          {tc.ok === null ? (
            <div className="border-2 border-border border-t-primary rounded-full animate-spin w-3 h-3 shrink-0" />
          ) : tc.ok ? (
            <span className="text-emerald-400 shrink-0">✓</span>
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
      <button onClick={() => setOpen(v => !v)}
        className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 transition-colors">
        <ChevronRight className={`w-3 h-3 transition-transform ${open ? 'rotate-90' : ''}`} />
        已使用 {calls.length} 個工具
      </button>
      {open && (
        <div className="mt-1.5 space-y-1 pl-4 border-l border-border">
          {calls.map((tc, i) => (
            <div key={i} className="flex items-center gap-2 text-muted-foreground">
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${tc.ok ? 'bg-emerald-400' : 'bg-red-400'}`} />
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
    <strong className="font-semibold text-foreground">{children}</strong>,
  h1: ({ children }: { children?: React.ReactNode }) =>
    <h1 className="font-semibold text-base mb-1.5 mt-3 text-foreground">{children}</h1>,
  h2: ({ children }: { children?: React.ReactNode }) =>
    <h2 className="font-semibold mb-1 mt-2.5 text-foreground">{children}</h2>,
  h3: ({ children }: { children?: React.ReactNode }) =>
    <h3 className="font-semibold mb-1 mt-2 text-foreground">{children}</h3>,
  code: ({ inline, children }: { inline?: boolean; children?: React.ReactNode }) =>
    inline
      ? <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono text-primary">{children}</code>
      : <code className="block bg-muted border border-border rounded-lg p-3 overflow-x-auto text-xs font-mono mb-2 whitespace-pre text-foreground">{children}</code>,
  pre: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  img: ({ src, alt }: { src?: string; alt?: string }) =>
    src ? <img src={src} alt={alt ?? ''} className="max-w-full rounded-lg mt-2" /> : null,
  table: ({ children }: { children?: React.ReactNode }) => (
    <div className="overflow-x-auto mb-2">
      <table className="text-xs border-collapse w-full">{children}</table>
    </div>
  ),
  th: ({ children }: { children?: React.ReactNode }) => (
    <th className="border border-border bg-muted px-2 py-1.5 text-left font-medium text-muted-foreground">{children}</th>
  ),
  td: ({ children }: { children?: React.ReactNode }) => (
    <td className="border border-border px-2 py-1.5 text-foreground">{children}</td>
  ),
}

export default function ChatPage() {
  const router = useRouter()
  const [messages, setMessages] = useState<TextMessage[]>([])
  const [historyLoaded, setHistoryLoaded] = useState(false)
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [askUser, setAskUser] = useState<AskUserState | null>(null)
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [editText, setEditText] = useState('')
  const [uploadedFile, setUploadedFile] = useState<{ fileId: string; filename: string; previewUrl?: string } | null>(null)
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [historyPanelOpen, setHistoryPanelOpen] = useState(false)
  const [viewingSessionId, setViewingSessionId] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const editRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const token = getCookie('token')
    if (!token) { router.push('/login'); return }
    loadHistoryFromServer(token).then(msgs => {
      if (msgs === null) { deleteCookie('token'); router.push('/login'); return }
      setMessages(msgs)
      setHistoryLoaded(true)
    })
  }, [])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, streaming])
  useEffect(() => { if (editingIndex !== null) editRef.current?.focus() }, [editingIndex])

  const autoResize = useCallback((el: HTMLTextAreaElement | null) => {
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }, [])

  function handleSessionExpired() {
    deleteCookie('token')
    setMessages(prev => [...prev, { role: 'assistant', content: 'Session 已過期，即將跳轉至登入頁面...' }])
    setTimeout(() => router.push('/login'), 1500)
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
                const token = getCookie('token')
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
      const token = getCookie('token')
      if (token && finalMessages.length > 0) saveHistoryToServer(token, finalMessages)
    }
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const token = getCookie('token')
    if (!token) return
    const previewUrl = file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch(`${BASE}/api/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      })
      if (res.ok) {
        const data = await res.json()
        setUploadedFile({ fileId: data.file_id, filename: data.filename, previewUrl })
      } else {
        if (previewUrl) URL.revokeObjectURL(previewUrl)
      }
    } catch {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  async function handleSend(e?: { preventDefault?(): void }) {
    e?.preventDefault?.()
    if (!input.trim() || streaming) return
    const token = getCookie('token')
    if (!token) { router.push('/login'); return }
    const userMsg = input.trim()
    const pendingFile = uploadedFile
    setInput('')
    setUploadedFile(null)
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
    const attachments: Attachment[] = pendingFile ? [{
      id: pendingFile.fileId,
      filename: pendingFile.filename,
      mimeType: pendingFile.filename.match(/\.(png|jpg|jpeg|gif|webp)$/i) ? 'image/' + pendingFile.filename.split('.').pop()!.toLowerCase() : 'application/octet-stream',
      url: `${BASE}/api/files/${pendingFile.fileId}`,
    }] : []
    setMessages(prev => [...prev, {
      role: 'user',
      content: userMsg,
      attachments,
      attachmentPreview: pendingFile?.previewUrl,
    }])
    await runStream(`${BASE}/chat`, { token, message: userMsg, file_id: pendingFile?.fileId ?? null })
  }

  function sendSuggestion(text: string) {
    setInput(text)
    setTimeout(() => textareaRef.current?.focus(), 0)
  }

  async function handleAnswer(selected: string) {
    const token = getCookie('token')
    if (!token) { router.push('/login'); return }
    setAskUser(null)
    setMessages(prev => [...prev, { role: 'user', content: `▶ ${selected}` }])
    await runStream(`${BASE}/answer`, { token, selected })
  }

  async function handleClearHistory() {
    const token = getCookie('token')
    if (token) await clearHistoryOnServer(token)
    setMessages([])
  }

  function handleSwitchSession(msgs: TextMessage[], sessionId: string) {
    setMessages(msgs)
    setViewingSessionId(sessionId)
    setHistoryPanelOpen(false)
  }

  function handleNewSession() {
    // newSession() API call is already made inside SessionHistoryPanel — don't call it again
    setMessages([])
    setViewingSessionId(null)
    setHistoryPanelOpen(false)
  }

  function startEdit(index: number) {
    if (streaming) return
    setEditingIndex(index)
    setEditText(messages[index].content)
  }

  function cancelEdit() { setEditingIndex(null); setEditText('') }

  async function submitEdit() {
    if (!editText.trim() || editingIndex === null || streaming) return
    const token = getCookie('token')
    if (!token) { router.push('/login'); return }
    const newMsg = editText.trim()
    setMessages(prev => [...prev.slice(0, editingIndex), { role: 'user', content: newMsg }])
    setEditingIndex(null)
    setEditText('')
    await runStream(`${BASE}/chat`, { token, message: newMsg })
  }

  const lastIdx = messages.length - 1
  const isEmpty = historyLoaded && messages.length === 0 && !streaming

  return (
    <div className="flex flex-col h-[calc(100dvh-3rem)]">
      <SessionHistoryPanel
        open={historyPanelOpen}
        onClose={() => setHistoryPanelOpen(false)}
        onSwitch={handleSwitchSession}
        onNewSession={handleNewSession}
        viewingSessionId={viewingSessionId}
        disabled={streaming}
      />

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto bg-background relative">
        {/* Loading history */}
        {!historyLoaded && (
          <div className="flex items-center justify-center h-full gap-2 text-muted-foreground text-sm">
            <div className="border-2 border-border border-t-primary rounded-full animate-spin w-4 h-4" />
            載入中...
          </div>
        )}

        {/* Empty state */}
        {isEmpty && (
          <div className="flex flex-col items-center justify-center h-full px-6 pb-8 gap-6">
            <div className="flex flex-col items-center gap-3 text-center">
              <div className="w-14 h-14 rounded-2xl bg-accent flex items-center justify-center">
                <Bot className="w-7 h-7 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground mb-1">需要什麼協助？</p>
                <p className="text-xs text-muted-foreground">詢問課表、成績、缺曠、假單等問題</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 w-full max-w-sm">
              {SUGGESTIONS.map(s => (
                <button key={s.text} onClick={() => sendSuggestion(s.text)}
                  className="text-left bg-card hover:bg-accent border border-border hover:border-primary/40 rounded-xl px-3 py-2.5 transition-colors group">
                  <p className="text-xs font-medium text-foreground group-hover:text-primary leading-snug">{s.text}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{s.sub}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Messages */}
        {!isEmpty && (
          <div className="py-6 px-4 md:px-6 space-y-6 max-w-3xl mx-auto">
            {messages.map((m, i) => (
              <div key={i} className={`flex gap-3 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {m.role === 'assistant' && (
                  <div className="w-7 h-7 rounded-full bg-accent flex items-center justify-center shrink-0 mt-0.5">
                    <Bot className="w-4 h-4 text-primary" />
                  </div>
                )}
                <div className={`${m.role === 'user' ? 'max-w-[75%]' : 'flex-1 min-w-0'}`}>
                  {m.role === 'user' ? (
                    editingIndex === i ? (
                      <div className="flex flex-col gap-2">
                        <textarea ref={editRef} value={editText} onChange={e => setEditText(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitEdit() }
                            if (e.key === 'Escape') cancelEdit()
                          }}
                          rows={3}
                          className="w-full bg-card border border-border text-foreground rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/50"
                        />
                        <div className="flex justify-end gap-2">
                          <button onClick={cancelEdit}
                            className="text-xs text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-lg border border-border hover:bg-accent transition-colors">
                            取消
                          </button>
                          <button onClick={submitEdit} disabled={!editText.trim()}
                            className="text-xs bg-primary hover:bg-primary/80 disabled:opacity-40 text-primary-foreground px-3 py-1.5 rounded-lg transition-colors">
                            重新送出
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="group relative">
                        {!streaming && (
                          <button onClick={() => startEdit(i)}
                            className="absolute -left-7 top-2 opacity-0 group-hover:opacity-100 transition-opacity text-stone-300 hover:text-stone-500 p-1"
                            title="編輯">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                        )}
                        <div className="bg-primary text-primary-foreground rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap">
                          {m.content}
                        </div>
                        {(m.attachments ?? []).length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-1.5 justify-end">
                            {m.attachments!.map(att => (
                              att.mimeType.startsWith('image/') && m.attachmentPreview ? (
                                <img
                                  key={att.id}
                                  src={m.attachmentPreview}
                                  alt={att.filename}
                                  title={att.filename}
                                  className="h-20 w-20 object-cover rounded-lg border border-white/20 cursor-pointer hover:opacity-90 transition-opacity"
                                  onClick={() => setLightboxSrc(m.attachmentPreview!)}
                                />
                              ) : (
                                <span key={att.id} className="inline-flex items-center gap-1.5 text-xs bg-white/20 rounded-lg px-2.5 py-1" title={att.filename}>
                                  <Paperclip className="w-3 h-3" />
                                  {att.filename}
                                </span>
                              )
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  ) : (
                    i === lastIdx && streaming && m.content === '' && !askUser ? (
                      (m.toolCalls ?? []).length > 0
                        ? <LiveToolPanel calls={m.toolCalls!} />
                        : <ThinkingDots />
                    ) : (
                      <div>
                        {streaming && i === lastIdx && (m.toolCalls ?? []).length > 0 && m.content === '' && (
                          <div className="mb-2"><LiveToolPanel calls={m.toolCalls!} /></div>
                        )}
                        {m.content && (
                          <div className="text-sm leading-relaxed text-foreground">
                            <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents as never}>
                              {m.content}
                            </ReactMarkdown>
                          </div>
                        )}
                        {(m.images ?? []).map((uri, j) => (
                          <img key={j} src={uri} alt="圖表" className="max-w-full rounded-lg mt-2" />
                        ))}
                        {m.aborted && <p className="text-xs text-stone-400 mt-1 italic">（已中斷）</p>}
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
              <div className="flex gap-3 justify-start">
                <div className="w-7 h-7 rounded-full bg-accent flex items-center justify-center shrink-0 mt-0.5">
                  <Bot className="w-4 h-4 text-primary" />
                </div>
                <div className="bg-card border border-border rounded-2xl rounded-tl-sm px-4 py-3 max-w-sm shadow-sm">
                  <p className="text-sm text-foreground mb-3">{askUser.question}</p>
                  <div className="space-y-1.5">
                    {askUser.options.map(opt => (
                      <button key={opt} onClick={() => handleAnswer(opt)}
                        className="w-full text-left text-sm bg-background hover:bg-accent border border-border hover:border-primary/40 text-foreground hover:text-primary rounded-lg px-3 py-2 transition-colors">
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

      {/* Lightbox */}
      {lightboxSrc && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setLightboxSrc(null)}
        >
          <img
            src={lightboxSrc}
            alt="附件預覽"
            className="max-w-full max-h-full rounded-xl object-contain"
            onClick={e => e.stopPropagation()}
          />
          <button
            onClick={() => setLightboxSrc(null)}
            className="absolute top-4 right-4 text-white/80 hover:text-white text-2xl leading-none"
          >✕</button>
        </div>
      )}

      {/* Input area */}
      <div className="shrink-0 border-t border-border bg-card">
        <div className="max-w-3xl mx-auto px-4 py-3">
          {uploadedFile && (
            <div className="flex items-center gap-2 mb-2">
              {uploadedFile.previewUrl ? (
                <div className="relative group">
                  <img
                    src={uploadedFile.previewUrl}
                    alt={uploadedFile.filename}
                    className="h-14 w-14 object-cover rounded-lg border border-border cursor-pointer"
                    onClick={() => setLightboxSrc(uploadedFile.previewUrl!)}
                  />
                  <button
                    onClick={() => setUploadedFile(null)}
                    className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-foreground/80 text-background rounded-full text-[10px] flex items-center justify-center leading-none opacity-0 group-hover:opacity-100 transition-opacity"
                  >✕</button>
                </div>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-xs text-foreground bg-muted border border-border rounded-lg px-2.5 py-1">
                  <Paperclip className="w-3.5 h-3.5 text-muted-foreground" />
                  {uploadedFile.filename}
                  <button onClick={() => setUploadedFile(null)}
                    className="text-muted-foreground hover:text-foreground ml-0.5 transition-colors">✕</button>
                </span>
              )}
            </div>
          )}

          <div className="flex gap-2 items-end">
            <input ref={fileInputRef} type="file" className="hidden" accept="image/*,.pdf" onChange={handleFileSelect} />

            <Popover>
              <PopoverTrigger
                type="button"
                title="工具箱"
                className="h-9 w-9 flex items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-border hover:bg-accent transition-colors shrink-0"
              >
                <LayoutGrid className="w-4 h-4" />
              </PopoverTrigger>
              <PopoverContent side="top" align="start" className="w-44 p-1.5 gap-0">
                <button
                  onClick={() => setHistoryPanelOpen(true)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-stone-700 hover:bg-stone-100 rounded-md transition-colors"
                >
                  <History className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                  會話管理
                </button>
              </PopoverContent>
            </Popover>

            <button type="button" onClick={() => fileInputRef.current?.click()}
              disabled={streaming || uploading} title="上傳附件"
              className="h-9 w-9 flex items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-40 transition-colors shrink-0">
              {uploading
                ? <div className="border-2 border-border border-t-primary rounded-full animate-spin w-4 h-4" />
                : <Paperclip className="w-4 h-4" />
              }
            </button>

            <textarea
              ref={textareaRef}
              value={input}
              onChange={e => { setInput(e.target.value); autoResize(e.target) }}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSend()
                }
              }}
              placeholder="輸入訊息… (Shift+Enter 換行)"
              rows={1}
              disabled={streaming || !!askUser || editingIndex !== null}
              className="flex-1 min-h-9 max-h-40 bg-muted border border-border text-foreground placeholder:text-muted-foreground rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50 resize-none overflow-y-auto leading-5"
            />

            {streaming ? (
              <button type="button" onClick={() => abortRef.current?.abort()}
                className="h-9 w-9 flex items-center justify-center bg-muted hover:bg-accent border border-border text-muted-foreground rounded-lg transition-colors shrink-0">
                <Square className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button type="button" onClick={() => handleSend()}
                disabled={!input.trim() || !!askUser || editingIndex !== null}
                className="h-9 w-9 flex items-center justify-center bg-primary hover:bg-primary/80 disabled:opacity-40 text-primary-foreground rounded-lg transition-colors shrink-0">
                <Send className="w-4 h-4" />
              </button>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground/50 mt-1.5 text-center">AI 可能會出錯，重要事項請自行確認</p>
        </div>
      </div>
    </div>
  )
}
