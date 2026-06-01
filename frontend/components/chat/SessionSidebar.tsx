'use client'

import { Plus, Trash2, MessageSquare } from 'lucide-react'
import type { SessionInfo } from '@/types/chat'

function relativeTime(ts: number): string {
  const diff = Date.now() - ts * 1000
  const min = Math.floor(diff / 60_000)
  if (min < 1) return '剛剛'
  if (min < 60) return `${min} 分鐘前`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr} 小時前`
  const day = Math.floor(hr / 24)
  if (day < 7) return `${day} 天前`
  return new Date(ts * 1000).toLocaleDateString('zh-TW', { month: 'short', day: 'numeric' })
}

interface SessionSidebarProps {
  sessions: SessionInfo[]
  activeSessionId: string | null
  isStreaming: boolean
  onNewSession: () => void
  onSelectSession: (id: string) => void
  onDeleteSession: (id: string) => void
}

export default function SessionSidebar({
  sessions,
  activeSessionId,
  isStreaming,
  onNewSession,
  onSelectSession,
  onDeleteSession,
}: SessionSidebarProps) {
  return (
    <aside className="w-56 shrink-0 flex flex-col bg-stone-50 border-r border-stone-200 overflow-hidden">
      {/* Header */}
      <div className="px-3 py-3 border-b border-stone-200">
        <button
          onClick={onNewSession}
          disabled={isStreaming}
          className="w-full flex items-center justify-center gap-2 text-xs font-medium text-stone-600 hover:text-stone-900 bg-white hover:bg-stone-100 border border-stone-200 hover:border-stone-300 rounded-lg px-3 py-2 transition-colors disabled:opacity-40"
        >
          <Plus className="w-3.5 h-3.5" />
          新對話
        </button>
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto py-1.5">
        {sessions.length === 0 && (
          <div className="px-3 py-6 text-center text-xs text-stone-400">
            尚無對話紀錄
          </div>
        )}
        {sessions.map((session) => {
          const isActive = session.sessionId === activeSessionId
          return (
            <div
              key={session.sessionId}
              className={`group relative mx-1.5 mb-0.5 rounded-lg cursor-pointer transition-colors ${
                isActive
                  ? 'bg-indigo-50 text-indigo-900'
                  : 'text-stone-500 hover:bg-stone-100 hover:text-stone-700'
              }`}
              onClick={() => onSelectSession(session.sessionId)}
            >
              <div className="flex items-start gap-2 px-2.5 py-2 pr-7">
                <MessageSquare className="w-3.5 h-3.5 mt-0.5 shrink-0 opacity-50" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium truncate">
                    {session.title ?? '新對話'}
                  </p>
                  <p className="text-[10px] opacity-40 mt-0.5">
                    {relativeTime(session.updatedAt)}
                  </p>
                </div>
              </div>

              {/* Delete button — shown on hover, hidden for active streaming */}
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onDeleteSession(session.sessionId)
                }}
                disabled={isStreaming && isActive}
                className="absolute right-1.5 top-1.5 p-1 rounded-md opacity-0 group-hover:opacity-100 text-stone-400 hover:text-red-500 hover:bg-red-50 transition-all disabled:pointer-events-none"
                title="刪除對話"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          )
        })}
      </div>

      {/* Footer label */}
      <div className="px-3 py-2.5 border-t border-stone-200">
        <p className="text-[10px] text-stone-400 text-center">對話紀錄儲存於伺服器</p>
      </div>
    </aside>
  )
}
