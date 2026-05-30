import { useState, useRef, useEffect, type FormEvent } from 'react'
import { getToken, clearToken } from '../api/auth'
import { useNavigate } from 'react-router-dom'

interface TextMessage {
  role: 'user' | 'assistant'
  content: string
}

interface AskUserState {
  question: string
  options: string[]
  tool_call_id: string
}

async function* streamSse(
  url: string,
  body: object,
  signal: AbortSignal,
): AsyncGenerator<Record<string, unknown>> {
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
        try {
          yield JSON.parse(line.slice(6))
        } catch { /* skip malformed */ }
      }
    }
  }
}

export default function ChatPage() {
  const [messages, setMessages] = useState<TextMessage[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [askUser, setAskUser] = useState<AskUserState | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streaming])

  function handleSessionExpired() {
    clearToken()
    navigate('/login')
  }

  async function runStream(url: string, body: object) {
    const ac = new AbortController()
    abortRef.current = ac
    setStreaming(true)
    setAskUser(null)

    let assistantText = ''
    setMessages((prev) => [...prev, { role: 'assistant', content: '' }])

    try {
      for await (const event of streamSse(url, body, ac.signal)) {
        if (event.type === 'text_delta') {
          assistantText += String(event.text ?? '')
          setMessages((prev) => {
            const next = [...prev]
            next[next.length - 1] = { role: 'assistant', content: assistantText }
            return next
          })
        } else if (event.type === 'ask_user') {
          setAskUser({
            question: String(event.question ?? ''),
            options: (event.options as string[]) ?? [],
            tool_call_id: String(event.tool_call_id ?? ''),
          })
        } else if (event.type === 'tool_result') {
          const data = String(event.data ?? '')
          if (data.includes('NET_002')) {
            handleSessionExpired()
            return
          }
        }
      }
    } catch (err: unknown) {
      const detail = (err as { detail?: { error_code?: string } }).detail
      if (detail?.error_code === 'AUTH_002' || detail?.error_code === 'NET_002') {
        handleSessionExpired()
        return
      }
      setMessages((prev) => {
        const next = [...prev]
        next[next.length - 1] = { role: 'assistant', content: '發生錯誤，請稍後再試。' }
        return next
      })
    } finally {
      setStreaming(false)
    }
  }

  async function handleSend(e: FormEvent) {
    e.preventDefault()
    if (!input.trim() || streaming) return
    const token = getToken()
    if (!token) { navigate('/login'); return }

    const userMsg = input.trim()
    setInput('')
    setMessages((prev) => [...prev, { role: 'user', content: userMsg }])
    await runStream('/chat', { token, message: userMsg })
  }

  async function handleAnswer(selected: string) {
    const token = getToken()
    if (!token) { navigate('/login'); return }
    setAskUser(null)
    setMessages((prev) => [...prev, { role: 'user', content: `▶ ${selected}` }])
    await runStream('/answer', { token, selected })
  }

  return (
    <div className="flex flex-col h-screen">
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.length === 0 && (
          <div className="text-center text-gray-400 mt-20">
            <p className="text-lg">AI 助理</p>
            <p className="text-sm mt-1">詢問課表、成績、缺曠、請假等問題</p>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[70%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap leading-relaxed ${
                m.role === 'user'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white border border-gray-200 text-gray-800'
              }`}
            >
              {m.content || (streaming && i === messages.length - 1 ? '▌' : '')}
            </div>
          </div>
        ))}

        {askUser && (
          <div className="flex justify-start">
            <div className="bg-white border border-gray-200 rounded-2xl px-4 py-3 max-w-sm">
              <p className="text-sm text-gray-700 mb-3">{askUser.question}</p>
              <div className="space-y-2">
                {askUser.options.map((opt) => (
                  <button
                    key={opt}
                    onClick={() => handleAnswer(opt)}
                    className="w-full text-left text-sm border border-indigo-200 text-indigo-700 hover:bg-indigo-50 rounded-lg px-3 py-2 transition-colors"
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

      <div className="border-t border-gray-200 bg-white px-4 py-3">
        <form onSubmit={handleSend} className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="輸入訊息..."
            disabled={streaming || !!askUser}
            className="flex-1 border border-gray-300 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-50"
          />
          <button
            type="submit"
            disabled={!input.trim() || streaming || !!askUser}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white rounded-xl px-4 py-2 text-sm font-medium transition-colors"
          >
            送出
          </button>
        </form>
      </div>
    </div>
  )
}
