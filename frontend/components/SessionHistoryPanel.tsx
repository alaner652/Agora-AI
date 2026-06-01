'use client'

import { useState, useEffect } from 'react'
import { MessageSquarePlus, Trash2 } from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { getSessions, switchSession, deleteSessionById, newSession, type SessionMeta, type TextMessage } from '@/lib/data'

interface Props {
  open: boolean
  onClose: () => void
  onSwitch: (messages: TextMessage[], sessionId: string) => void
  onNewSession: () => void
  viewingSessionId: string | null  // which session the user is currently viewing (frontend-tracked)
  disabled: boolean
}

function formatDate(iso: string): string {
  if (!iso) return ''
  return new Date(iso).toLocaleString('zh-TW', {
    month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

export function SessionHistoryPanel({ open, onClose, onSwitch, onNewSession, viewingSessionId, disabled }: Props) {
  const [sessions, setSessions] = useState<SessionMeta[]>([])
  const [loggerSessionId, setLoggerSessionId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [switchingId, setSwitchingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [startingNew, setStartingNew] = useState(false)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    getSessions()
      .then(({ sessions, current_session_id }) => {
        setSessions(sessions)
        setLoggerSessionId(current_session_id)
      })
      .catch(() => setSessions([]))
      .finally(() => setLoading(false))
  }, [open])

  // Which session to highlight: prefer frontend-tracked viewingSessionId, fall back to logger's session
  const activeSessionId = viewingSessionId ?? loggerSessionId

  async function handleNewSession() {
    if (disabled || startingNew) return
    setStartingNew(true)
    try {
      await newSession()  // single API call — parent's onNewSession does NOT call it again
      onNewSession()
    } catch {
      /* ignore */
    } finally {
      setStartingNew(false)
    }
  }

  async function handleSwitch(sessionId: string) {
    if (disabled || switchingId || deletingId) return
    setSwitchingId(sessionId)
    try {
      const msgs = await switchSession(sessionId)
      onSwitch(msgs, sessionId)
    } catch {
      /* ignore */
    } finally {
      setSwitchingId(null)
    }
  }

  async function handleDelete(e: React.MouseEvent, sessionId: string) {
    e.stopPropagation()
    if (switchingId || deletingId) return
    setDeletingId(sessionId)
    try {
      await deleteSessionById(sessionId)
      setSessions(prev => prev.filter(s => s.session_id !== sessionId))
    } catch {
      /* ignore */
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <Sheet open={open} onOpenChange={v => { if (!v) onClose() }}>
      <SheetContent side="right" showCloseButton className="w-80 sm:max-w-80 flex flex-col p-0 gap-0">
        <SheetHeader className="border-b border-stone-200 px-4 py-3">
          <SheetTitle className="text-sm font-medium text-stone-700">
            會話管理
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center py-12 gap-2 text-stone-400 text-xs">
              <div className="border-2 border-stone-200 border-t-indigo-500 rounded-full animate-spin w-4 h-4" />
              載入中...
            </div>
          )}

          {!loading && sessions.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-stone-400 text-xs gap-2">
              <MessageSquarePlus className="w-6 h-6 opacity-30" />
              尚無歷史對話
            </div>
          )}

          {!loading && sessions.length > 0 && (
            <ul className="divide-y divide-stone-100">
              {sessions.map(s => {
                const isCurrent = s.session_id === activeSessionId
                return (
                  <li key={s.session_id} className="group flex items-stretch">
                    <button
                      onClick={() => handleSwitch(s.session_id)}
                      disabled={disabled || !!switchingId || !!deletingId}
                      className={`flex-1 text-left px-4 py-3 disabled:opacity-50 transition-colors ${
                        isCurrent ? 'bg-indigo-50/60 hover:bg-indigo-50' : 'hover:bg-stone-50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className={`text-xs font-medium truncate ${isCurrent ? 'text-indigo-700' : 'text-stone-700'}`}>
                          {s.title || formatDate(s.started_at)}
                        </span>
                        {isCurrent && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full shrink-0 bg-indigo-100 text-indigo-600">
                            目前對話
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 flex items-center gap-2">
                        <span className="text-[10px] text-stone-400">
                          {formatDate(s.started_at)} · {s.turn_count} 輪
                        </span>
                        {switchingId === s.session_id && (
                          <div className="border border-stone-300 border-t-indigo-500 rounded-full animate-spin w-3 h-3" />
                        )}
                      </div>
                    </button>

                    {!isCurrent && (
                      <button
                        onClick={e => handleDelete(e, s.session_id)}
                        disabled={!!switchingId || !!deletingId}
                        title="刪除此對話"
                        className="px-3 opacity-0 group-hover:opacity-100 text-stone-300 hover:text-red-400 hover:bg-red-50 disabled:opacity-30 transition-all"
                      >
                        {deletingId === s.session_id
                          ? <div className="border border-stone-300 border-t-red-400 rounded-full animate-spin w-3.5 h-3.5" />
                          : <Trash2 className="w-3.5 h-3.5" />
                        }
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {/* Footer: 新會話按鈕，左對齊 */}
        <div className="shrink-0 border-t border-stone-200 px-4 py-3">
          <button
            onClick={handleNewSession}
            disabled={disabled || startingNew}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg disabled:opacity-40 transition-colors"
          >
            {startingNew
              ? <div className="border-2 border-indigo-200 border-t-indigo-500 rounded-full animate-spin w-3 h-3" />
              : <MessageSquarePlus className="w-3.5 h-3.5" />
            }
            新會話
          </button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
