import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getLeaves, type LeaveItem } from '../api/data'
import { useNavigate } from 'react-router-dom'
import { clearToken } from '../api/auth'

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

const STATUS_COLORS: Record<string, string> = {
  核准: 'text-green-700 bg-green-50',
  待審: 'text-yellow-700 bg-yellow-50',
  退件: 'text-red-700 bg-red-50',
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

  return (
    <div className="p-6">
      <h2 className="text-xl font-semibold text-gray-900 mb-6">假單</h2>

      <div className="flex flex-wrap items-end gap-3 mb-6">
        <div>
          <label className="block text-xs text-gray-500 mb-1">開始日期</label>
          <input
            type="text"
            placeholder="1150901"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-28 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">結束日期</label>
          <input
            type="text"
            placeholder="1160131"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-28 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <button
          onClick={() => setQuery({ start, end })}
          className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg px-4 py-1.5 text-sm font-medium transition-colors"
        >
          查詢
        </button>
      </div>

      {isLoading && <p className="text-gray-400 text-sm">載入中...</p>}

      {!isLoading && leaves && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {leaves.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-8">此區間無假單</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600">日期</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600">節次</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600">假別</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600">原因</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600">狀態</th>
                </tr>
              </thead>
              <tbody>
                {leaves.map((l, i) => (
                  <tr key={i} className="border-b border-gray-100 last:border-0">
                    <td className="px-4 py-2.5 text-gray-800">{l.date}</td>
                    <td className="px-4 py-2.5 text-gray-600">{l.periods}</td>
                    <td className="px-4 py-2.5 text-gray-600">{l.type}</td>
                    <td className="px-4 py-2.5 text-gray-800">{l.reason}</td>
                    <td className="px-4 py-2.5">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[l.status] ?? 'text-gray-600 bg-gray-100'}`}>
                        {l.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}
