import { useRef, useState } from 'react'
import type { UsageData } from '@/types/chat'

// ─── Event Dispatch API ───────────────────────────────────────────────────────
//
// Each event handler receives this object instead of raw store methods.
// This decouples the registry from the Zustand store, making handlers
// independently testable and reusable.

export interface EventDispatch {
  appendText: (text: string) => void
  appendThinking: (text: string) => void
  addToolCall: (name: string, args: Record<string, unknown>) => void
  resolveToolCall: (name: string, ok: boolean, data: string, unconfirmed: boolean) => void
  setAskUser: (question: string, options: string[], toolCallId: string) => void
  notifyUsage: (usage: UsageData) => void
}

// ─── Handler Registry ─────────────────────────────────────────────────────────
//
// One function per SSE event type. Adding a new event type = adding one entry
// here, nothing else changes. Extra handlers passed by callers win on collision.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type EventHandler<T = Record<string, any>> = (event: T, dispatch: EventDispatch) => void

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const DEFAULT_HANDLERS: Record<string, EventHandler<any>> = {
  // Backend type is "thinking" (not "thinking_delta")
  text_delta:  (e, d) => d.appendText(e.text),
  thinking:    (e, d) => d.appendThinking(e.text),
  tool_call:   (e, d) => d.addToolCall(e.name, e.args ?? {}),
  tool_result: (e, d) => d.resolveToolCall(e.name, e.ok, e.data ?? '', e.unconfirmed ?? false),
  ask_user:    (e, d) => d.setAskUser(e.question, e.options, e.tool_call_id),
  usage: (e, d) =>
    d.notifyUsage({
      inputTokens:  e.input_tokens,
      outputTokens: e.output_tokens,
      cachedTokens: e.cached_tokens,
      costUsd:      e.cost_usd,
    }),
  done: () => {},
}

// ─── SSE Parser ──────────────────────────────────────────────────────────────

async function* parseSSE(
  response: Response,
  signal: AbortSignal,
): AsyncGenerator<Record<string, unknown>> {
  const reader = response.body?.getReader()
  if (!reader) return

  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (!signal.aborted) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })

      // SSE messages are separated by double newlines
      const parts = buffer.split('\n\n')
      buffer = parts.pop() ?? ''

      for (const part of parts) {
        for (const line of part.split('\n')) {
          const trimmed = line.trim()
          if (!trimmed.startsWith('data:')) continue
          const json = trimmed.slice(5).trim()
          if (!json || json === '[DONE]') continue
          try {
            yield JSON.parse(json)
          } catch {
            // Malformed JSON — skip silently
          }
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

interface UseChatStreamOptions {
  dispatch: EventDispatch
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  extraHandlers?: Record<string, EventHandler<any>>
  /** Called after 'done' event or a clean abort. usage is null when aborted. */
  onStreamEnd: (usage: UsageData | null) => void
  onError: (error: unknown) => void
}

interface UseChatStreamResult {
  /**
   * Opens a POST SSE stream to `endpoint` with `body`.
   * Returns the AbortController so callers can cancel on unmount / session switch.
   */
  start: (endpoint: string, body: object) => AbortController
  isStreaming: boolean
}

export function useChatStream({
  dispatch,
  extraHandlers,
  onStreamEnd,
  onError,
}: UseChatStreamOptions): UseChatStreamResult {
  const [isStreaming, setIsStreaming] = useState(false)
  // Keep a stable ref to the latest options so the async loop always reads
  // the current callbacks even after re-renders.
  const optsRef = useRef({ dispatch, extraHandlers, onStreamEnd, onError })
  optsRef.current = { dispatch, extraHandlers, onStreamEnd, onError }

  function start(endpoint: string, body: object): AbortController {
    const ac = new AbortController()
    const { signal } = ac

    setIsStreaming(true)

    ;(async () => {
      let lastUsage: UsageData | null = null

      try {
        const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'
        const url = endpoint.startsWith('http') ? endpoint : `${BASE}${endpoint}`

        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal,
        })

        if (!response.ok) {
          let errPayload: unknown
          try { errPayload = await response.json() } catch { errPayload = response.statusText }
          throw errPayload
        }

        const handlers = { ...DEFAULT_HANDLERS, ...(optsRef.current.extraHandlers ?? {}) }

        for await (const event of parseSSE(response, signal)) {
          const type = event.type as string | undefined
          if (!type) continue

          if (type === 'usage') {
            // Track usage even before calling the handler so onStreamEnd has it
            lastUsage = {
              inputTokens:  event.input_tokens as number,
              outputTokens: event.output_tokens as number,
              cachedTokens: event.cached_tokens as number,
              costUsd:      event.cost_usd as number,
            }
          }

          const handler = handlers[type]
          if (handler) {
            handler(event, optsRef.current.dispatch)
          }

          if (type === 'done') break
        }

        optsRef.current.onStreamEnd(signal.aborted ? null : lastUsage)
      } catch (err) {
        if ((err as { name?: string }).name === 'AbortError') {
          optsRef.current.onStreamEnd(null)
        } else {
          optsRef.current.onError(err)
        }
      } finally {
        setIsStreaming(false)
      }
    })()

    return ac
  }

  return { start, isStreaming }
}
