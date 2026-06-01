'use client'

import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import type { ToolRecord } from '@/types/chat'

const TOOL_LABELS: Record<string, string> = {
  get_semester_options: '取得學期清單',
  get_schedule: '查詢課表',
  get_absence: '查詢缺曠',
  get_absence_options: '取得缺曠選項',
  get_grades: '查詢成績',
  get_leaves: '查詢假單',
  apply_leave: '申請假單',
  delete_leave: '刪除假單',
  render_image: '產生圖表',
  ask_user: '詢問使用者',
}

interface ToolPanelProps {
  toolCalls: ToolRecord[]
  isStreaming: boolean
}

// Shown while stream is active — spinners for in-flight tools
function LivePanel({ toolCalls }: { toolCalls: ToolRecord[] }) {
  return (
    <div className="space-y-1.5 py-1">
      {toolCalls.map((tc, i) => (
        <div key={i} className="flex items-center gap-2 text-xs text-stone-500">
          {tc.ok === null ? (
            <div className="border-2 border-stone-300 border-t-indigo-400 rounded-full animate-spin w-3 h-3 shrink-0" />
          ) : tc.ok ? (
            <span className="text-emerald-400 shrink-0 text-[10px]">✓</span>
          ) : (
            <span className="text-red-400 shrink-0 text-[10px]">✗</span>
          )}
          <span className={tc.ok === false ? 'text-red-400' : ''}>
            {TOOL_LABELS[tc.name] ?? tc.name}
          </span>
          {tc.unconfirmed && <span className="text-amber-500 ml-auto text-[10px]">待確認</span>}
        </div>
      ))}
    </div>
  )
}

// Shown after stream ends — collapsible summary
function DonePanel({ toolCalls }: { toolCalls: ToolRecord[] }) {
  const [open, setOpen] = useState(false)
  if (toolCalls.length === 0) return null

  return (
    <div className="mt-2 text-xs">
      <button
        onClick={() => setOpen((v) => !v)}
        className="text-stone-400 hover:text-stone-600 flex items-center gap-1.5 transition-colors"
      >
        <ChevronRight
          className={`w-3 h-3 transition-transform ${open ? 'rotate-90' : ''}`}
        />
        已使用 {toolCalls.length} 個工具
      </button>
      {open && (
        <div className="mt-1.5 space-y-1 pl-4 border-l border-stone-200">
          {toolCalls.map((tc, i) => (
            <div key={i} className="flex items-center gap-2 text-stone-500">
              <span
                className={`w-1.5 h-1.5 rounded-full shrink-0 ${tc.ok ? 'bg-emerald-500' : 'bg-red-500'}`}
              />
              {TOOL_LABELS[tc.name] ?? tc.name}
              {tc.unconfirmed && (
                <span className="text-amber-500 ml-1 text-[10px]">待確認</span>
              )}
              {tc.ok === false && (
                <span className="text-red-400 ml-auto">失敗</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function ToolPanel({ toolCalls, isStreaming }: ToolPanelProps) {
  if (toolCalls.length === 0) return null
  return isStreaming ? <LivePanel toolCalls={toolCalls} /> : <DonePanel toolCalls={toolCalls} />
}
