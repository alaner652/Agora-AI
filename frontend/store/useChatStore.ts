import { create } from 'zustand'
import type {
  AssistantMessage,
  AskUserPrompt,
  Message,
  ProviderInfo,
  SessionInfo,
  StreamStatus,
  UsageData,
} from '@/types/chat'

// ─── Helpers ────────────────────────────────────────────────────────────────

// Stable reference so selectors never return a new [] on every call
// (useSyncExternalStore compares with Object.is and loops on new references)
const EMPTY_MESSAGES: Message[] = []

function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function getMessages(map: Record<string, Message[]>, sessionId: string | null): Message[] {
  if (!sessionId) return EMPTY_MESSAGES
  return map[sessionId] ?? EMPTY_MESSAGES
}

function updateMessage(
  map: Record<string, Message[]>,
  sessionId: string | null,
  msgId: string,
  updater: (msg: Message) => Message,
): Record<string, Message[]> {
  if (!sessionId) return map
  const msgs = map[sessionId] ?? []
  return {
    ...map,
    [sessionId]: msgs.map((m) => (m.id === msgId ? updater(m) : m)),
  }
}

// ─── Store interface ─────────────────────────────────────────────────────────

interface ChatState {
  // ── Sessions ──
  sessions: SessionInfo[]
  activeSessionId: string | null

  // ── Messages (keyed by sessionId) ──
  messageMap: Record<string, Message[]>

  // ── Stream state machine ──
  streamStatus: StreamStatus
  abortController: AbortController | null

  // ── Interactive pause ──
  pendingAskUser: AskUserPrompt | null

  // ── Input ──
  inputText: string
  uploadedFile: { path: string; name: string } | null

  // ── Provider indicator ──
  providerInfo: ProviderInfo | null

  // ── Session actions ──
  setSessions: (sessions: SessionInfo[]) => void
  /**
   * Switch active session. If a stream is in flight it is aborted first,
   * which prevents race conditions when the user switches sessions mid-stream.
   */
  switchSession: (sessionId: string) => void
  initSessionMessages: (sessionId: string, msgs: Message[]) => void

  // ── Optimistic UI ──
  /**
   * Immediately appends a UserMessage with status 'pending' before any fetch.
   * Returns the generated id so the caller can correlate it with the response.
   */
  appendUserMessage: (
    content: string,
    attachment?: { path: string; name: string },
  ) => string

  /**
   * Appends an empty AssistantMessage placeholder (status 'streaming').
   * Returns the generated id so streaming deltas can target it.
   */
  appendAssistantPlaceholder: () => string

  // ── Incremental stream updates ──
  appendTextDelta: (msgId: string, delta: string) => void
  appendThinkingDelta: (msgId: string, delta: string) => void
  addToolCall: (msgId: string, name: string, args?: Record<string, unknown>) => void
  resolveToolCall: (
    msgId: string,
    name: string,
    ok: boolean,
    data: string,
    unconfirmed: boolean,
  ) => void
  addImage: (msgId: string, url: string) => void

  // ── Stream lifecycle ──
  setStreamStatus: (status: StreamStatus) => void
  setAbortController: (ac: AbortController | null) => void
  /** Called by useChatStream when the 'done' event arrives. */
  finalizeMessage: (msgId: string, usage?: UsageData) => void
  /** Called when the stream was aborted (user switched session or cancelled). */
  abortMessage: (msgId: string) => void

  // ── Ask-user ──
  setPendingAskUser: (prompt: AskUserPrompt | null) => void

  // ── Input ──
  setInputText: (text: string) => void
  setUploadedFile: (file: { path: string; name: string } | null) => void

  // ── Tool retry ──
  /**
   * Retry a failed tool call by re-sending the user's original message.
   * Increments retryCount and returns a new message ID for the retry.
   */
  retryFailedTool: (msgId: string, toolName: string) => string | null

  // ── Provider ──
  setProviderInfo: (info: ProviderInfo) => void
}

// ─── Store implementation ────────────────────────────────────────────────────

export const useChatStore = create<ChatState>()((set, get) => ({
  sessions: [],
  activeSessionId: null,
  messageMap: {},
  streamStatus: 'idle',
  abortController: null,
  pendingAskUser: null,
  inputText: '',
  uploadedFile: null,
  providerInfo: null,

  // ── Session actions ─────────────────────────────────────────────────────

  setSessions: (sessions) => set({ sessions }),

  switchSession: (sessionId) => {
    const { streamStatus, abortController } = get()

    // Gracefully abort any active stream before switching
    if (streamStatus === 'streaming' && abortController) {
      abortController.abort()
      set({ streamStatus: 'aborting' })
    }

    set({ activeSessionId: sessionId, pendingAskUser: null })
  },

  initSessionMessages: (sessionId, msgs) =>
    set((s) => ({
      messageMap: { ...s.messageMap, [sessionId]: msgs },
    })),

  // ── Optimistic UI ───────────────────────────────────────────────────────

  appendUserMessage: (content, attachment) => {
    const id = uid()
    const { activeSessionId, messageMap } = get()
    if (!activeSessionId) return id

    const msg: Message = {
      id,
      role: 'user',
      content,
      attachment,
      status: 'pending',
      createdAt: Date.now(),
    }

    set({
      messageMap: {
        ...messageMap,
        [activeSessionId]: [...(messageMap[activeSessionId] ?? []), msg],
      },
    })
    return id
  },

  appendAssistantPlaceholder: () => {
    const id = uid()
    const { activeSessionId, messageMap } = get()
    if (!activeSessionId) return id

    const msg: AssistantMessage = {
      id,
      role: 'assistant',
      content: '',
      thinkingBlocks: [],
      toolCalls: [],
      images: [],
      status: 'streaming',
      createdAt: Date.now(),
    }

    set({
      messageMap: {
        ...messageMap,
        [activeSessionId]: [...(messageMap[activeSessionId] ?? []), msg],
      },
    })
    return id
  },

  // ── Incremental updates ─────────────────────────────────────────────────

  appendTextDelta: (msgId, delta) => {
    const { activeSessionId, messageMap } = get()
    set({
      messageMap: updateMessage(messageMap, activeSessionId, msgId, (m) =>
        m.role === 'assistant' ? { ...m, content: m.content + delta } : m,
      ),
    })
  },

  appendThinkingDelta: (msgId, delta) => {
    const { activeSessionId, messageMap } = get()
    set({
      messageMap: updateMessage(messageMap, activeSessionId, msgId, (m) => {
        if (m.role !== 'assistant') return m
        const blocks = [...m.thinkingBlocks]
        const last = blocks[blocks.length - 1]
        if (!last || last.isComplete) {
          blocks.push({ content: delta, isComplete: false })
        } else {
          blocks[blocks.length - 1] = { ...last, content: last.content + delta }
        }
        return { ...m, thinkingBlocks: blocks }
      }),
    })
  },

  addToolCall: (msgId, name, args) => {
    const { activeSessionId, messageMap } = get()
    set({
      messageMap: updateMessage(messageMap, activeSessionId, msgId, (m) =>
        m.role === 'assistant'
          ? { ...m, toolCalls: [...m.toolCalls, { name, args, ok: null }] }
          : m,
      ),
    })
  },

  resolveToolCall: (msgId, name, ok, data, unconfirmed) => {
    const { activeSessionId, messageMap } = get()
    set({
      messageMap: updateMessage(messageMap, activeSessionId, msgId, (m) => {
        if (m.role !== 'assistant') return m
        // Find last pending tool with matching name
        const tools = [...m.toolCalls]
        for (let i = tools.length - 1; i >= 0; i--) {
          if (tools[i].name === name && tools[i].ok === null) {
            tools[i] = { ...tools[i], ok, data, unconfirmed }
            break
          }
        }
        return { ...m, toolCalls: tools }
      }),
    })
  },

  addImage: (msgId, url) => {
    const { activeSessionId, messageMap } = get()
    set({
      messageMap: updateMessage(messageMap, activeSessionId, msgId, (m) =>
        m.role === 'assistant' ? { ...m, images: [...m.images, url] } : m,
      ),
    })
  },

  // ── Stream lifecycle ────────────────────────────────────────────────────

  setStreamStatus: (streamStatus) => set({ streamStatus }),

  setAbortController: (abortController) => set({ abortController }),

  finalizeMessage: (msgId, usage) => {
    const { activeSessionId, messageMap } = get()
    set({
      streamStatus: 'idle',
      abortController: null,
      messageMap: updateMessage(messageMap, activeSessionId, msgId, (m) => {
        if (m.role !== 'assistant') return m
        // Close any open thinking block
        const thinkingBlocks = m.thinkingBlocks.map((b) =>
          b.isComplete ? b : { ...b, isComplete: true },
        )
        return { ...m, status: 'complete', usage, thinkingBlocks }
      }),
    })
  },

  abortMessage: (msgId) => {
    const { activeSessionId, messageMap } = get()
    set({
      streamStatus: 'idle',
      abortController: null,
      pendingAskUser: null,
      messageMap: updateMessage(messageMap, activeSessionId, msgId, (m) => {
        if (m.role !== 'assistant') return m
        const toolCalls = m.toolCalls.map((t) =>
          t.ok === null ? { ...t, ok: false } : t,
        )
        const thinkingBlocks = m.thinkingBlocks.map((b) =>
          b.isComplete ? b : { ...b, isComplete: true },
        )
        return { ...m, status: 'aborted', toolCalls, thinkingBlocks }
      }),
    })
  },

  // ── Ask-user ────────────────────────────────────────────────────────────

  setPendingAskUser: (pendingAskUser) => set({ pendingAskUser }),

  // ── Input ───────────────────────────────────────────────────────────────

  setInputText: (inputText) => set({ inputText }),

  setUploadedFile: (uploadedFile) => set({ uploadedFile }),

  // ── Tool retry ──────────────────────────────────────────────────────────

  retryFailedTool: (msgId, toolName) => {
    const { activeSessionId, messageMap } = get()
    if (!activeSessionId) return null

    const messages = messageMap[activeSessionId]
    if (!messages) return null

    // Find the assistant message with this tool call
    let userMsgBefore: Message | undefined
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i]
      if (msg.id === msgId && msg.role === 'assistant') {
        // Find the user message that preceded this assistant response
        for (let j = i - 1; j >= 0; j--) {
          if (messages[j].role === 'user') {
            userMsgBefore = messages[j]
            break
          }
        }
        break
      }
    }

    if (!userMsgBefore || userMsgBefore.role !== 'user') return null

    // Create a new user message with retry context
    const newUserMsgId = uid()
    const newMsg: UserMessage = {
      id: newUserMsgId,
      role: 'user',
      content: `[重試] ${userMsgBefore.content}`,
      attachment: userMsgBefore.attachment,
      status: 'sent',
      createdAt: Date.now(),
    }

    // Append new user message to conversation
    set({
      messageMap: {
        ...messageMap,
        [activeSessionId]: [...messages, newMsg],
      },
    })

    return newUserMsgId
  },

  // ── Provider ────────────────────────────────────────────────────────────

  setProviderInfo: (providerInfo) => set({ providerInfo }),
})

// ─── Selectors ───────────────────────────────────────────────────────────────

/** Returns messages for the currently active session. */
export const selectActiveMessages = (s: ChatState): Message[] =>
  getMessages(s.messageMap, s.activeSessionId)

/** Returns true while a stream is actively running. */
export const selectIsStreaming = (s: ChatState): boolean =>
  s.streamStatus === 'streaming'
