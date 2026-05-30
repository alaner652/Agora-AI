import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getSemesterOptions, getSchedule, type SemesterOption, type ScheduleEntry } from '../api/data'
import { useNavigate } from 'react-router-dom'
import { clearToken } from '../api/auth'

const DAY_LABELS = ['', '一', '二', '三', '四', '五', '六', '日']
const MAX_PERIOD = 14

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

export default function SchedulePage() {
  const [semester, setSemester] = useState('')
  const onSessionErr = useSessionGuard()

  const { data: opts, error: optsErr } = useQuery<SemesterOption[]>({
    queryKey: ['semester-options'],
    queryFn: getSemesterOptions,
  })

  const { data: entries, isLoading, error: schedErr } = useQuery<ScheduleEntry[]>({
    queryKey: ['schedule', semester],
    queryFn: () => getSchedule(semester),
    enabled: !!semester,
  })

  useEffect(() => { if (optsErr) onSessionErr(optsErr) }, [optsErr])
  useEffect(() => { if (schedErr) onSessionErr(schedErr) }, [schedErr])

  const grid: Record<number, Record<number, { course: string; teacher: string; room: string }>> = {}
  for (let d = 1; d <= 7; d++) grid[d] = {}
  for (const e of entries ?? []) {
    if (!grid[e.day]) grid[e.day] = {}
    grid[e.day][e.period] = { course: e.course, teacher: e.teacher, room: e.room }
  }

  return (
    <div className="p-6">
      <div className="flex items-center gap-4 mb-6">
        <h2 className="text-xl font-semibold text-gray-900">課表</h2>
        <select
          value={semester}
          onChange={(e) => setSemester(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="">選擇學期</option>
          {(opts ?? []).map((o: SemesterOption) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {!semester && <p className="text-gray-400 text-sm">請先選擇學期</p>}
      {semester && isLoading && <p className="text-gray-400 text-sm">載入中...</p>}

      {semester && !isLoading && entries && (
        <div className="overflow-x-auto">
          <table className="border-collapse text-xs w-full">
            <thead>
              <tr>
                <th className="w-10 border border-gray-200 bg-gray-50 p-2 text-gray-500">節</th>
                {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                  <th
                    key={d}
                    className="border border-gray-200 bg-gray-50 p-2 text-gray-700 font-medium min-w-25"
                  >
                    週{DAY_LABELS[d]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: MAX_PERIOD }, (_, i) => i + 1).map((p) => (
                <tr key={p}>
                  <td className="border border-gray-200 bg-gray-50 text-center text-gray-500 p-1">
                    {p}
                  </td>
                  {[1, 2, 3, 4, 5, 6, 7].map((d) => {
                    const cell = grid[d]?.[p]
                    return (
                      <td
                        key={d}
                        className={`border border-gray-200 p-1.5 align-top ${cell ? 'bg-indigo-50' : ''}`}
                      >
                        {cell && (
                          <div>
                            <div className="font-medium text-indigo-800 leading-tight">{cell.course}</div>
                            <div className="text-gray-500 mt-0.5">{cell.teacher}</div>
                            <div className="text-gray-400">{cell.room}</div>
                          </div>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
