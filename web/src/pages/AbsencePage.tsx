import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getAbsenceOptions, getAbsence, type AbsenceEntry, type AbsenceOptions } from '../api/data'
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

export default function AbsencePage() {
  const [semester, setSemester] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [leaveType, setLeaveType] = useState('00')
  const [query, setQuery] = useState<{ semester: string; start: string; end: string; type: string } | null>(null)
  const onErr = useSessionGuard()

  const { data: opts, error: optsErr } = useQuery<AbsenceOptions>({
    queryKey: ['absence-options'],
    queryFn: getAbsenceOptions,
  })

  const { data: entries, isLoading, error: absErr } = useQuery<AbsenceEntry[]>({
    queryKey: ['absence', query],
    queryFn: () => getAbsence(query!.semester, query!.start, query!.end, query!.type),
    enabled: !!query,
  })

  useEffect(() => { if (optsErr) onErr(optsErr) }, [optsErr])
  useEffect(() => { if (absErr) onErr(absErr) }, [absErr])

  function handleSearch() {
    if (!semester) return
    setQuery({ semester, start, end, type: leaveType })
  }

  return (
    <div className="p-6">
      <h2 className="text-xl font-semibold text-gray-900 mb-6">缺曠</h2>

      <div className="flex flex-wrap items-end gap-3 mb-6">
        <div>
          <label className="block text-xs text-gray-500 mb-1">學期</label>
          <select
            value={semester}
            onChange={(e) => setSemester(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">選擇學期</option>
            {(opts?.semesters ?? []).map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">假別</label>
          <select
            value={leaveType}
            onChange={(e) => setLeaveType(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {(opts?.leave_types ?? [{ value: '00', label: '全部' }]).map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">開始日期（民國）</label>
          <input
            type="text"
            placeholder="1150901"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-28 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">結束日期（民國）</label>
          <input
            type="text"
            placeholder="1160131"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-28 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <button
          onClick={handleSearch}
          disabled={!semester}
          className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white rounded-lg px-4 py-1.5 text-sm font-medium transition-colors"
        >
          查詢
        </button>
      </div>

      {isLoading && <p className="text-gray-400 text-sm">載入中...</p>}

      {!isLoading && entries && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {entries.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-8">此區間無記錄</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600">日期</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600">星期</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600">節次</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600">假別</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e, i) => (
                  <tr key={i} className="border-b border-gray-100 last:border-0">
                    <td className="px-4 py-2.5 text-gray-800 tabular-nums">{e.date}</td>
                    <td className="px-4 py-2.5 text-gray-600">週{e.weekday}</td>
                    <td className="px-4 py-2.5 text-gray-600">{e.period}</td>
                    <td className="px-4 py-2.5">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        e.type === '缺曠' ? 'bg-red-50 text-red-700' : 'bg-yellow-50 text-yellow-700'
                      }`}>
                        {e.type}
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
