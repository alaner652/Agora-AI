'use client'

import { useState, useRef, useEffect } from 'react'
import { Bot, Copy, Check, Pencil } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import type { Components } from 'react-markdown'
import 'highlight.js/styles/github.css'
import type { AskUserPrompt, AssistantMessage, Message, UserMessage } from '@/types/chat'
import ThinkingBlock from './ThinkingBlock'
import ToolPanel from './ToolPanel'
import TokenBadge from './TokenBadge'

// ─── Code block with copy button ────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch { /* ignore */ }
  }

  return (
    <button
      onClick={copy}
      className="absolute top-2 right-2 p-1.5 rounded-md bg-stone-200/80 hover:bg-stone-300/80 text-stone-500 hover:text-stone-700 transition-all"
      title="複製"
    >
      {copied
        ? <Check className="w-3 h-3 text-emerald-400" />
        : <Copy className="w-3 h-3" />}
    </button>
  )
}

// Collect raw text from React children (needed for the copy button)
function extractText(children: React.ReactNode): string {
  if (typeof children === 'string') return children
  if (Array.isArray(children)) return children.map(extractText).join('')
  if (children && typeof children === 'object' && 'props' in (children as object)) {
    return extractText((children as React.ReactElement<{ children?: React.ReactNode }>).props.children)
  }
  return ''
}

function CodeBlock({ children, className }: { children?: React.ReactNode; className?: string }) {
  const text = extractText(children)
  return (
    <div className="relative group my-2">
      <CopyButton text={text} />
      <code className={className}>{children}</code>
    </div>
  )
}

// ─── Markdown component maps ─────────────────────────────────────────────────

// Used during streaming — no syntax highlighting, no flicker
const streamingComponents: Components = {
  p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
  ul: ({ children }) => <ul className="list-disc pl-4 mb-2 space-y-0.5">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal pl-4 mb-2 space-y-0.5">{children}</ol>,
  li: ({ children }) => <li>{children}</li>,
  strong: ({ children }) => <strong className="font-semibold text-stone-800">{children}</strong>,
  h1: ({ children }) => <h1 className="font-semibold text-base mb-1.5 mt-3 text-stone-800">{children}</h1>,
  h2: ({ children }) => <h2 className="font-semibold mb-1 mt-2.5 text-stone-800">{children}</h2>,
  h3: ({ children }) => <h3 className="font-semibold mb-1 mt-2 text-stone-700">{children}</h3>,
  // Inline + block code — no highlighting
  code: ({ children, className }) => {
    const isBlock = className?.startsWith('language-')
    return isBlock
      ? <code className="block bg-stone-100 border border-stone-200 rounded-lg p-3 overflow-x-auto text-xs font-mono mb-2 whitespace-pre text-stone-800">{children}</code>
      : <code className="bg-stone-100 px-1.5 py-0.5 rounded text-xs font-mono text-indigo-600">{children}</code>
  },
  pre: ({ children }) => <>{children}</>,
  img: ({ src, alt }) => src
    ? <img src={src} alt={alt ?? ''} className="max-w-full rounded-lg mt-2" />
    : null,
  table: ({ children }) => (
    <div className="overflow-x-auto mb-2">
      <table className="text-xs border-collapse w-full">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border border-stone-200 bg-stone-50 px-2 py-1.5 text-left font-medium text-stone-500">{children}</th>
  ),
  td: ({ children }) => (
    <td className="border border-stone-200 px-2 py-1.5 text-stone-700">{children}</td>
  ),
}

// Used after streaming — full syntax highlighting + copy buttons
const completeComponents: Components = {
  ...streamingComponents,
  // Override code: block gets copy button + rehype-highlight classes
  code: ({ children, className }) => {
    const isBlock = className?.startsWith('language-')
    return isBlock
      ? <CodeBlock className={className}>{children}</CodeBlock>
      : <code className="bg-stone-100 px-1.5 py-0.5 rounded text-xs font-mono text-indigo-600">{children}</code>
  },
  // pre wraps the block code — give it the light bg + relative positioning
  pre: ({ children }) => (
    <pre className="bg-stone-100 border border-stone-200 rounded-lg p-3 overflow-x-auto text-xs font-mono mb-2 whitespace-pre text-stone-800 relative">
      {children}
    </pre>
  ),
}

// ─── User message ────────────────────────────────────────────────────────────

interface UserMessageItemProps {
  message: UserMessage
  isStreaming: boolean
  onEdit?: (newContent: string) => void
}

function UserMessageItem({ message, isStreaming, onEdit }: UserMessageItemProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(message.content)
  const editRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (editing) editRef.current?.focus()
  }, [editing])

  function startEdit() {
    if (isStreaming) return
    setDraft(message.content)
    setEditing(true)
  }

  function cancel() {
    setEditing(false)
    setDraft(message.content)
  }

  function submit() {
    if (!draft.trim() || !onEdit) return
    onEdit(draft.trim())
    setEditing(false)
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-2 max-w-[75%] ml-auto">
        <textarea
          ref={editRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() }
            if (e.key === 'Escape') cancel()
          }}
          rows={3}
          className="w-full bg-white border border-stone-200 text-stone-900 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
        />
        <div className="flex justify-end gap-2">
          <button
            onClick={cancel}
            className="text-xs text-stone-500 hover:text-stone-700 px-3 py-1.5 rounded-lg border border-stone-200 hover:bg-stone-50 transition-colors"
          >
            取消
          </button>
          <button
            onClick={submit}
            disabled={!draft.trim()}
            className="text-xs bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white px-3 py-1.5 rounded-lg transition-colors"
          >
            重新送出
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="group relative ml-auto max-w-[75%]">
      {!isStreaming && onEdit && (
        <button
          onClick={startEdit}
          className="absolute -left-7 top-2 opacity-0 group-hover:opacity-100 transition-opacity text-stone-400 hover:text-stone-600 p-1"
          title="編輯"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
      )}
      <div className="bg-indigo-600 text-white rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap">
        {message.content}
      </div>
    </div>
  )
}

// ─── Assistant message ───────────────────────────────────────────────────────

interface AssistantMessageItemProps {
  message: AssistantMessage
  isLast: boolean
  isStreaming: boolean
  pendingAskUser: AskUserPrompt | null
  onAnswer?: (selected: string) => void
}

function AssistantMessageItem({
  message,
  isLast,
  isStreaming,
  pendingAskUser,
  onAnswer,
}: AssistantMessageItemProps) {
  const isStreamingThis = isStreaming && isLast
  const isComplete = message.status === 'complete'
  // Guard against messages loaded from history that may lack these arrays
  const thinkingBlocks = message.thinkingBlocks ?? []
  const toolCalls = message.toolCalls ?? []
  const images = message.images ?? []
  const showThinkingOrTools = thinkingBlocks.length > 0 || toolCalls.length > 0

  return (
    <div className="flex gap-3 flex-1 min-w-0">
      {/* Bot avatar */}
      <div className="w-7 h-7 rounded-full bg-indigo-50 border border-indigo-200 flex items-center justify-center shrink-0 mt-0.5">
        <Bot className="w-4 h-4 text-indigo-500" />
      </div>

      <div className="flex-1 min-w-0">
        {/* ThinkingBlocks */}
        {showThinkingOrTools ? (
          <ThinkingBlock blocks={thinkingBlocks} isStreaming={isStreamingThis} />
        ) : null}

        {/* Tool calls */}
        {toolCalls.length > 0 && (
          <ToolPanel toolCalls={toolCalls} isStreaming={isStreamingThis} />
        )}

        {/* Initial loading — no text, no tools yet */}
        {isStreamingThis && message.content === '' && toolCalls.length === 0 && thinkingBlocks.length === 0 && (
          <div className="flex items-center gap-1.5 py-2">
            {[0, 150, 300].map((d) => (
              <span
                key={d}
                className="w-2 h-2 rounded-full bg-stone-300 animate-bounce"
                style={{ animationDelay: `${d}ms` }}
              />
            ))}
          </div>
        )}

        {/* Markdown content */}
        {message.content && (
          <div className="text-sm leading-relaxed text-stone-800">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={isComplete ? [[rehypeHighlight, { detect: true, ignoreMissing: true }]] : []}
              components={(isComplete ? completeComponents : streamingComponents) as never}
            >
              {message.content}
            </ReactMarkdown>
          </div>
        )}

        {/* Rendered images */}
        {images.map((url, j) => (
          <img key={j} src={url} alt="圖表" className="max-w-full rounded-lg mt-2 border border-stone-200" />
        ))}

        {/* Aborted indicator */}
        {message.status === 'aborted' && (
          <p className="text-xs text-stone-400 mt-1 italic">（已中斷）</p>
        )}

        {/* Token badge — only on completed messages */}
        {message.usage && isComplete && (
          <TokenBadge usage={message.usage} />
        )}

        {/* Ask-user prompt — rendered below the last assistant message */}
        {isLast && pendingAskUser && onAnswer && (
          <div className="mt-3 bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 max-w-sm">
            <p className="text-sm text-stone-800 mb-3">{pendingAskUser.question}</p>
            <div className="space-y-1.5">
              {pendingAskUser.options.map((opt) => (
                <button
                  key={opt}
                  onClick={() => onAnswer(opt)}
                  className="w-full text-left text-sm bg-white hover:bg-indigo-600 border border-stone-200 hover:border-indigo-500 text-stone-700 hover:text-white rounded-lg px-3 py-2 transition-colors"
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Public component ────────────────────────────────────────────────────────

interface MessageItemProps {
  message: Message
  isLast: boolean
  isStreaming: boolean
  pendingAskUser: AskUserPrompt | null
  onEdit?: (newContent: string) => void
  onAnswer?: (selected: string) => void
}

export default function MessageItem({
  message,
  isLast,
  isStreaming,
  pendingAskUser,
  onEdit,
  onAnswer,
}: MessageItemProps) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <UserMessageItem message={message} isStreaming={isStreaming} onEdit={onEdit} />
      </div>
    )
  }

  return (
    <div className="flex justify-start">
      <AssistantMessageItem
        message={message}
        isLast={isLast}
        isStreaming={isStreaming}
        pendingAskUser={pendingAskUser}
        onAnswer={onAnswer}
      />
    </div>
  )
}
