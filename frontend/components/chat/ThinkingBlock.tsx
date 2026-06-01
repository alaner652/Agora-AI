'use client'

import { useState } from 'react'
import { ChevronRight, Brain } from 'lucide-react'
import type { ThinkingBlock as ThinkingBlockType } from '@/types/chat'

interface ThinkingBlockProps {
  blocks: ThinkingBlockType[]
  isStreaming: boolean
}

function ThinkingDots() {
  return (
    <div className="flex items-center gap-2 py-1">
      <Brain className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
      <span className="text-xs text-indigo-400">思考中</span>
      <div className="flex gap-1">
        {[0, 150, 300].map((d) => (
          <span
            key={d}
            className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce"
            style={{ animationDelay: `${d}ms` }}
          />
        ))}
      </div>
    </div>
  )
}

export default function ThinkingBlock({ blocks, isStreaming }: ThinkingBlockProps) {
  const [open, setOpen] = useState(false)

  // Nothing to show yet
  if (blocks.length === 0) {
    if (!isStreaming) return null
    return (
      <div className="mb-3 px-3 py-2 rounded-lg bg-indigo-50 border border-indigo-200">
        <ThinkingDots />
      </div>
    )
  }

  const allComplete = blocks.every((b) => b.isComplete)
  const fullText = blocks.map((b) => b.content).join('')
  const charCount = fullText.length

  // Last block still streaming — show live content
  if (!allComplete) {
    return (
      <div className="mb-3 px-3 py-2.5 rounded-lg bg-indigo-50 border border-indigo-200">
        <div className="flex items-center gap-2 mb-2">
          <Brain className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
          <span className="text-xs text-indigo-500">思考中</span>
        </div>
        <pre className="text-xs text-indigo-600/70 whitespace-pre-wrap font-mono leading-relaxed max-h-32 overflow-y-auto">
          {fullText}
          <span className="animate-pulse">▌</span>
        </pre>
      </div>
    )
  }

  // All blocks complete — show collapsible
  return (
    <div className="mb-3 rounded-lg bg-indigo-50 border border-indigo-200 overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-indigo-100/60 transition-colors"
      >
        <Brain className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
        <span className="text-xs text-indigo-500 flex-1">
          查看思考過程 <span className="text-indigo-400">({charCount.toLocaleString()} 字)</span>
        </span>
        <ChevronRight
          className={`w-3.5 h-3.5 text-indigo-400 transition-transform shrink-0 ${open ? 'rotate-90' : ''}`}
        />
      </button>
      {open && (
        <div className="px-3 pb-3 border-t border-indigo-200">
          <pre className="text-xs text-indigo-600/70 whitespace-pre-wrap font-mono leading-relaxed mt-2 max-h-60 overflow-y-auto">
            {fullText}
          </pre>
        </div>
      )}
    </div>
  )
}
