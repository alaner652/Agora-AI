'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2, Bot } from 'lucide-react'
import { getCookie, deleteCookie } from '@/lib/cookie'
import { useChatStore, selectActiveMessages, selectIsStreaming } from '@/store/useChatStore'
import { useChatStream, type EventDispatch } from '@/hooks/useChatStream'
import type { Message, SessionInfo, ProviderInfo } from '@/types/chat'
import MessageItem from '@/components/chat/MessageItem'
import SessionSidebar from '@/components/chat/SessionSidebar'
import ChatInput from '@/components/chat/ChatInput'
import ProviderBadge from '@/components/chat/ProviderBadge'

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function deriveProvider(data: { has_custom_config: boolean; base_url: string; model: string }): ProviderInfo {
  const url = (data.base_url ?? '').toLowerCase()
  const isLocal = url.includes('localhost') || url.includes('127.0.0.1') || url.includes('ollama')
  return { model: data.model ?? 'unknown', isLocal }
}

async function apiFetch<T>(path: string, token: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...opts?.headers },
  })
  if (!res.ok) throw await res.json().catch(() => ({ error_code: 'NET_003' }))
  return res.json()
}

/**
 * Convert backend OpenAI-format history to frontend Message[] for display.
 *
 * Backend format (stored by ChatMemory):
 *   { role: "user"|"assistant"|"tool", content, tool_calls?, tool_call_id? }
 *
 * Frontend format: UserMessage | AssistantMessage (no separate "tool" rows).
 * We merge consecutive (assistant w/ tool_calls) + (tool results) + (assistant final text)
 * into a single AssistantMessage with toolCalls populated.
 */
function parseBackendHistory(raw: unknown[]): Message[] {
  const out: Message[] = []
  let i = 0

  while (i < raw.length) {
    const m = raw[i] as Record<string, unknown>

    if (m.role === 'user') {
      out.push({
        id: `h-${i}-${Date.now()}`,
        role: 'user',
        content: (m.content as string) ?? '',
        status: 'sent',
        createdAt: 0,
      })
      i++
      continue
    }

    if (m.role === 'assistant') {
      // Collect all consecutive assistant + tool messages that form one logical turn
      const toolCalls: import('@/types/chat').ToolRecord[] = []
      let finalContent = (m.content as string) ?? ''

      // If this assistant message has tool_calls, consume them + their tool results
      if (Array.isArray(m.tool_calls) && m.tool_calls.length > 0) {
        for (const tc of m.tool_calls as Array<{ function: { name: string } }>) {
          toolCalls.push({ name: tc.function?.name ?? '', ok: true })
        }
        i++ // move past this assistant message

        // Consume tool result messages
        while (i < raw.length && (raw[i] as Record<string, unknown>).role === 'tool') {
          i++
        }

        // If the next message is a final assistant text, consume it too
        if (i < raw.length && (raw[i] as Record<string, unknown>).role === 'assistant') {
          const next = raw[i] as Record<string, unknown>
          if (!Array.isArray(next.tool_calls) || next.tool_calls.length === 0) {
            finalContent = (next.content as string) ?? ''
            i++
          }
        }
      } else {
        i++
      }

      out.push({
        id: `h-${i}-${Date.now()}`,
        role: 'assistant',
        content: finalContent,
        thinkingBlocks: [],
        toolCalls,
        images: [],
        status: 'complete',
        createdAt: 0,
      })
      continue
    }

    // Skip orphan tool messages
    i++
  }

  return out
}

async function fetchRenderedImage(imageType: string, token: string): Promise<string | null> {
  try {
    const res = await fetch(`${BASE}/api/image/${imageType}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return null
    return URL.createObjectURL(await res.blob())
  } catch { return null }
}

const SUGGESTIONS = [
  { text: '查詢本學期課表', sub: '瀏覽今學期所有課程' },
  { text: '最近成績怎麼樣？', sub: '查看歷年成績紀錄' },
  { text: '本月有哪些缺曠？', sub: '確認出勤紀錄' },
  { text: '幫我申請病假', sub: '線上請假申請' },
]

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ChatPage() {
  const router = useRouter()

  // ── Store — narrow selectors to prevent full re-renders during streaming ──
  const messages      = useChatStore(selectActiveMessages)
  const isStreaming   = useChatStore(selectIsStreaming)
  const sessions      = useChatStore((s) => s.sessions)
  const activeSessionId = useChatStore((s) => s.activeSessionId)
  const pendingAskUser  = useChatStore((s) => s.pendingAskUser)
  const providerInfo    = useChatStore((s) => s.providerInfo)
  const abortController = useChatStore((s) => s.abortController)
  // Actions are stable references — get the whole store for dispatch methods
  const store = useChatStore()

  // ── Local UI state ──
  const [historyLoaded, setHistoryLoaded] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [inputText, setInputText] = useState('')
  const [uploadedFile, setUploadedFile] = useState<{ path: string; name: string } | null>(null)

  // Prevents React StrictMode double-invocation from creating duplicate sessions
  const initRef = useRef(false)

  // ── Refs ──
  const bottomRef = useRef<HTMLDivElement>(null)
  // Holds the current assistant message id so dispatch closure always reads latest
  const asstMsgIdRef = useRef<string>('')

  // ─── Auth guard ──────────────────────────────────────────────────────────

  function getToken(): string | null {
    const t = getCookie('token')
    if (!t) { router.push('/login'); return null }
    return t
  }

  function handleSessionExpired() {
    deleteCookie('token')
    router.push('/login')
  }

  // ─── Dispatch (built once; reads latest msgId via ref) ───────────────────

  const buildDispatch = useCallback((): EventDispatch => ({
    appendText: (t) => store.appendTextDelta(asstMsgIdRef.current, t),
    appendThinking: (t) => store.appendThinkingDelta(asstMsgIdRef.current, t),
    addToolCall: (n, a) => store.addToolCall(asstMsgIdRef.current, n, a),
    resolveToolCall: (n, ok, data, unconfirmed) => {
      store.resolveToolCall(asstMsgIdRef.current, n, ok, data, unconfirmed)
      // Side-effect: fetch rendered image when render_image tool succeeds
      if (n === 'render_image' && ok) {
        try {
          const parsed = JSON.parse(data)
          if (parsed?.type) {
            const token = getCookie('token')
            if (token) {
              fetchRenderedImage(parsed.type as string, token).then((url) => {
                if (url) store.addImage(asstMsgIdRef.current, url)
              })
            }
          }
        } catch { /* not JSON */ }
      }
      // Session expiry inside tool result
      if (!ok) {
        try {
          const parsed = JSON.parse(data)
          if (parsed?.error_code === 'NET_002') handleSessionExpired()
        } catch { /* not JSON */ }
      }
    },
    setAskUser: (q, opts, toolCallId) =>
      store.setPendingAskUser({ question: q, options: opts, toolCallId }),
    notifyUsage: () => {}, // captured in onStreamEnd
  }), [store]) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── useChatStream ───────────────────────────────────────────────────────

  const chatStream = useChatStream({
    dispatch: buildDispatch(),
    onStreamEnd: (usage) => {
      // History is auto-saved by the backend after each streaming request.
      // The frontend only needs to finalize the local message state.
      store.finalizeMessage(asstMsgIdRef.current, usage ?? undefined)
    },
    onError: (err) => {
      const detail = (err as { error_code?: string })
      if (detail?.error_code === 'AUTH_002' || detail?.error_code === 'NET_002') {
        handleSessionExpired()
        return
      }
      store.abortMessage(asstMsgIdRef.current)
    },
  })

  // ─── Mount: provider + sessions + history ────────────────────────────────

  useEffect(() => {
    // Guard: React StrictMode runs effects twice in development
    if (initRef.current) return
    initRef.current = true

    const token = getToken()
    if (!token) return

    async function init() {
      if (!token) return

      // Provider badge
      try {
        const data = await apiFetch<{ has_custom_config: boolean; base_url: string; model: string }>(
          '/api/settings/llm', token,
        )
        store.setProviderInfo(deriveProvider(data))
      } catch { /* non-critical */ }

      // Sessions
      let sessions: SessionInfo[] = []
      try {
        const raw = await apiFetch<Array<{ session_id: string; title: string | null; created_at: number; updated_at: number }>>(
          '/api/sessions', token,
        )
        sessions = raw.map((s) => ({
          sessionId: s.session_id,
          title: s.title,
          createdAt: s.created_at,
          updatedAt: s.updated_at,
        }))
      } catch { /* ignore */ }

      // Create first session if none
      if (sessions.length === 0) {
        try {
          const created = await apiFetch<{ session_id: string; title: string | null; created_at: number; updated_at: number }>(
            '/api/sessions', token, { method: 'POST', body: JSON.stringify({}) },
          )
          sessions = [{ sessionId: created.session_id, title: created.title, createdAt: created.created_at, updatedAt: created.updated_at }]
        } catch { /* ignore */ }
      }

      store.setSessions(sessions)

      if (sessions.length > 0) {
        const sid = sessions[0].sessionId
        store.switchSession(sid)
        await loadHistory(token, sid)
      }

      setHistoryLoaded(true)
    }

    init()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadHistory(token: string, sessionId: string) {
    try {
      // Backend returns OpenAI-format messages (role/content/tool_calls).
      // parseBackendHistory() converts them to the frontend Message[] format.
      const data = await apiFetch<{ messages: unknown[] }>(
        `/api/history?session_id=${sessionId}`, token,
      )
      store.initSessionMessages(sessionId, parseBackendHistory(data.messages ?? []))
    } catch {
      store.initSessionMessages(sessionId, [])
    }
  }

  // ─── Scroll to bottom ────────────────────────────────────────────────────

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length, isStreaming])

  // ─── Session actions ─────────────────────────────────────────────────────

  async function handleNewSession() {
    const token = getToken()
    if (!token) return
    try {
      const created = await apiFetch<{ session_id: string; title: string | null; created_at: number; updated_at: number }>(
        '/api/sessions', token, { method: 'POST', body: JSON.stringify({}) },
      )
      const newSession: SessionInfo = {
        sessionId: created.session_id,
        title: created.title,
        createdAt: created.created_at,
        updatedAt: created.updated_at,
      }
      store.setSessions([newSession, ...sessions])
      store.switchSession(newSession.sessionId)
      store.initSessionMessages(newSession.sessionId, [])
    } catch { /* ignore */ }
  }

  async function handleSelectSession(sessionId: string) {
    const token = getToken()
    if (!token) return
    store.switchSession(sessionId) // aborts any active stream
    // Load history if not yet cached
    const cached = useChatStore.getState().messageMap[sessionId]
    if (!cached) {
      await loadHistory(token, sessionId)
    }
  }

  async function handleDeleteSession(sessionId: string) {
    const token = getToken()
    if (!token) return
    try {
      await apiFetch(`/api/sessions/${sessionId}`, token, { method: 'DELETE' })
    } catch { /* ignore */ }
    const remaining = sessions.filter((s) => s.sessionId !== sessionId)
    store.setSessions(remaining)

    if (sessionId === activeSessionId) {
      if (remaining.length > 0) {
        handleSelectSession(remaining[0].sessionId)
      } else {
        handleNewSession()
      }
    }
  }

  // ─── Send / Answer ───────────────────────────────────────────────────────

  async function runStream(endpoint: string, body: object) {
    const asstId = store.appendAssistantPlaceholder()
    asstMsgIdRef.current = asstId
    store.setStreamStatus('streaming')
    const ac = chatStream.start(endpoint, body)
    store.setAbortController(ac)
  }

  async function handleSend() {
    if (!inputText.trim() || isStreaming) return
    const token = getToken()
    if (!token) return

    const text = inputText.trim()
    const file = uploadedFile
    setInputText('')
    setUploadedFile(null)

    // Optimistic user message
    const displayContent = file ? `${text}\n📎 ${file.name}` : text
    store.appendUserMessage(displayContent, file ?? undefined)

    const bodyMsg = file ? `${text}\n\n（附件路徑：${file.path}）` : text
    await runStream('/chat', {
      token,
      message: bodyMsg,
      attachment_path: file?.path,
      session_id: activeSessionId,
    })
  }

  async function handleAnswer(selected: string) {
    const token = getToken()
    if (!token) return
    store.setPendingAskUser(null)
    store.appendUserMessage(`▶ ${selected}`)
    await runStream('/answer', {
      token,
      selected,
      session_id: activeSessionId,
    })
  }

  async function handleEdit(index: number, newContent: string) {
    const token = getToken()
    if (!token) return

    // Truncate messages to the edited index, then re-run
    const sid = activeSessionId
    if (!sid) return
    const current = useChatStore.getState().messageMap[sid] ?? []
    store.initSessionMessages(sid, current.slice(0, index))
    store.appendUserMessage(newContent)
    await runStream('/chat', { token, message: newContent, session_id: sid })
  }

  async function handleClearHistory() {
    const token = getToken()
    if (!token || !activeSessionId) return
    try {
      await apiFetch(`/api/history?session_id=${activeSessionId}`, token, { method: 'DELETE' })
    } catch { /* ignore */ }
    store.initSessionMessages(activeSessionId, [])
  }

  // ─── File upload ──────────────────────────────────────────────────────────

  async function handleFileUpload(file: File) {
    const token = getToken()
    if (!token) return
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
        setUploadedFile({ path: data.path, name: data.name })
      }
    } catch { /* ignore */ } finally {
      setUploading(false)
    }
  }

  // ─── Derived state ────────────────────────────────────────────────────────

  const lastIdx = messages.length - 1
  const isEmpty = historyLoaded && messages.length === 0 && !isStreaming

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex h-[calc(100dvh-3rem)]">
      {/* Session sidebar */}
      <SessionSidebar
        sessions={sessions}
        activeSessionId={activeSessionId}
        isStreaming={isStreaming}
        onNewSession={handleNewSession}
        onSelectSession={handleSelectSession}
        onDeleteSession={handleDeleteSession}
      />

      {/* Main chat area */}
      <div className="flex flex-col flex-1 min-w-0 bg-white">
        {/* Chat header */}
        <div className="shrink-0 flex items-center gap-3 px-4 py-2.5 border-b border-stone-200 bg-stone-50">
          <ProviderBadge info={providerInfo} />
          <div className="flex-1" />
          {messages.length > 0 && !isStreaming && (
            <button
              onClick={handleClearHistory}
              title="清除對話"
              className="p-1.5 text-stone-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Messages area */}
        <div className="flex-1 overflow-y-auto relative">
          {/* Loading */}
          {!historyLoaded && (
            <div className="flex items-center justify-center h-full gap-2 text-stone-400 text-sm">
              <div className="border-2 border-stone-200 border-t-indigo-500 rounded-full animate-spin w-4 h-4" />
              載入中…
            </div>
          )}

          {/* Empty state */}
          {isEmpty && (
            <div className="flex flex-col items-center justify-center h-full px-6 pb-8 gap-6">
              <div className="flex flex-col items-center gap-3 text-center">
                <div className="w-14 h-14 rounded-2xl bg-indigo-50 border border-indigo-200 flex items-center justify-center">
                  <Bot className="w-7 h-7 text-indigo-500" />
                </div>
                <div>
                  <p className="text-sm font-medium text-stone-700 mb-1">需要什麼協助？</p>
                  <p className="text-xs text-stone-400">詢問課表、成績、缺曠、假單等問題</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 w-full max-w-sm">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s.text}
                    onClick={() => setInputText(s.text)}
                    className="text-left bg-white hover:bg-indigo-50 border border-stone-200 hover:border-indigo-300 rounded-xl px-3 py-2.5 transition-colors group"
                  >
                    <p className="text-xs font-medium text-stone-700 group-hover:text-indigo-600 leading-snug">
                      {s.text}
                    </p>
                    <p className="text-[10px] text-stone-400 mt-0.5 group-hover:text-indigo-500">
                      {s.sub}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Message list */}
          {historyLoaded && messages.length > 0 && (
            <div className="py-6 px-4 md:px-8 space-y-6 max-w-3xl mx-auto w-full">
              {messages.map((m, i) => (
                <MessageItem
                  key={m.id ?? i}
                  message={m}
                  isLast={i === lastIdx}
                  isStreaming={isStreaming}
                  pendingAskUser={i === lastIdx ? pendingAskUser : null}
                  onEdit={m.role === 'user' ? (newContent) => handleEdit(i, newContent) : undefined}
                  onAnswer={handleAnswer}
                />
              ))}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        {/* Input */}
        <ChatInput
          value={inputText}
          onChange={setInputText}
          isStreaming={isStreaming}
          hasAskUser={!!pendingAskUser}
          isDisabled={!historyLoaded}
          uploadedFile={uploadedFile}
          isUploading={uploading}
          onSend={handleSend}
          onStop={() => {
            abortController?.abort()
            store.abortMessage(asstMsgIdRef.current)
          }}
          onFileSelect={handleFileUpload}
          onFileClear={() => setUploadedFile(null)}
        />
      </div>
    </div>
  )
}
