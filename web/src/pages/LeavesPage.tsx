import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getLeaves, type LeaveItem } from '../api/data'
import { useNavigate } from 'react-router-dom'
import { clearToken } from '../api/auth'
import { toCEInput, inputValToRoc, thisMonthRange, lastMonthRange } from '../utils/date'

function useSessionGuard() {
  const navigate = useNavigate()
  return (err: unknown) => {
    const code = (err as { response?: { data?: { detail?: { error_code?: string } } } })
      ?.response?.data?.detail?.error_code
    if (code === 'AUTH_002' || code === 'NET_002') {
      clearToken()
      navigate('/login')
    }
  }
}

function StatusBadge({ label }: { label: string }) {
  let cls = 'text-gray-600 bg-gray-100'
  if (label === '已核准' || label === '核准') cls = 'text-green-700 bg-green-50'
  else if (label === '待審核' || label === '送出' || label === '待核准') cls = 'text-yellow-700 bg-yellow-50'
  else if (label === '退件' || label === '不核准') cls = 'text-red-700 bg-red-50'
  else if (label === '作廢' || label === '已刪除') cls = 'text-gray-400 bg-gray-50 line-through'
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      {label || '—'}
    </span>
  )
}

export default function LeavesPage() {
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [query, setQuery] = useState<{ start: string; end: string } | null>(null)
  const onErr = useSessionGuard()

  const { data: leaves, isLoading, error } = useQuery<LeaveItem[]>({
    queryKey: ['leaves', query],
    queryFn: () => getLeaves(query!.start, query!.end),
    enabled: !!query,
  })

  useEffect(() => { if (error) onErr(error) }, [error])

  function applyRange(range: [Date, Date]) {
    setStart(toCEInput(range[0]))
    setEnd(toCEInput(range[1]))
  }

  function handleQuery() {
    if (!start || !end) return
    setQuery({ start: inputValToRoc(start), end: inputValToRoc(end) })
  }

  return (
    <div className="p-6">
      <h2 className="text-xl font-semibold text-gray-900 mb-6">假單</h2>

      <div className="flex flex-wrap items-end gap-3 mb-6">
        <div>
          <div className="flex items-center gap-1.5 mb-1">
            <label className="text-xs text-gray-500">日期範圍</label>
            <button
              onClick={() => applyRange(thisMonthRange())}
              className="text-xs text-indigo-600 hover:underline"
            >
              本月
            </button>
            <span className="text-gray-300 text-xs">|</span>
            <button
              onClick={() => applyRange(lastMonthRange())}
              className="text-xs text-indigo-600 hover:underline"
            >
              上月
            </button>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <span className="text-gray-400 text-sm">—</span>
            <input
              type="date"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        <button
          onClick={handleQuery}
          disabled={!start || !end}
          className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white rounded-lg px-4 py-1.5 text-sm font-medium transition-colors"
        >
          查詢
        </button>
      </div>

      {!query && <p className="text-gray-400 text-sm">請選擇日期範圍後查詢</p>}
      {isLoading && <p className="text-gray-400 text-sm">載入中...</p>}

      {!isLoading && leaves && (
        <div className="space-y-3">
          {leaves.length === 0 ? (
            <p className="text-gray-400 text-sm">此區間無假單</p>
          ) : (
            leaves.map((l, i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium text-gray-900">{l.reason || '（無事由）'}</span>
                      {l.can_delete && (
                        <span className="text-xs text-gray-400 border border-gray-200 px-1.5 py-0.5 rounded">可刪除</span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500 space-y-0.5">
                      <div>假期：{l.start_date} — {l.end_date}</div>
                      <div>申請日：{l.apply_date}</div>
                    </div>
                  </div>
                  <div className="text-right space-y-1 shrink-0">
                    <div className="flex items-center gap-1.5 justify-end">
                      <span className="text-xs text-gray-400">導師</span>
                      <StatusBadge label={l.teacher_status} />
                    </div>
                    <div className="flex items-center gap-1.5 justify-end">
                      <span className="text-xs text-gray-400">教務</span>
                      <StatusBadge label={l.officer_status} />
                    </div>
                  </div>
                </div>
                {(l.teacher_note || l.officer_note) && (
                  <div className="mt-2 pt-2 border-t border-gray-100 text-xs text-gray-500 space-y-0.5">
                    {l.teacher_note && <div>導師備註：{l.teacher_note}</div>}
                    {l.officer_note && <div>教務備註：{l.officer_note}</div>}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
