export type StreamStatus = 'idle' | 'streaming' | 'aborting' | 'error'

export interface UsageData {
  inputTokens: number
  outputTokens: number
  cachedTokens: number
  costUsd: number
}

export interface ToolRecord {
  name: string
  args?: Record<string, unknown>
  /** null = in-flight, true/false = resolved */
  ok: boolean | null
  data?: string
  unconfirmed?: boolean
  /** Track retry count for failed tool calls */
  retryCount?: number
}

export interface ThinkingBlock {
  content: string
  isComplete: boolean
}

export interface UserMessage {
  id: string
  role: 'user'
  content: string
  attachment?: { path: string; name: string }
  status: 'pending' | 'sent'
  createdAt: number
}

export interface AssistantMessage {
  id: string
  role: 'assistant'
  content: string
  thinkingBlocks: ThinkingBlock[]
  toolCalls: ToolRecord[]
  /** Blob URLs for server-rendered images (not persisted) */
  images: string[]
  usage?: UsageData
  status: 'streaming' | 'complete' | 'aborted' | 'error'
  createdAt: number
}

export type Message = UserMessage | AssistantMessage

export interface AskUserPrompt {
  question: string
  options: string[]
  toolCallId: string
}

export interface SessionInfo {
  sessionId: string
  title: string | null
  createdAt: number
  updatedAt: number
}

export interface ProviderInfo {
  model: string
  /** true when the endpoint is Ollama / localhost */
  isLocal: boolean
}
