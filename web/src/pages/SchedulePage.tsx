import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getSemesterOptions, getSchedule, type SemesterOption, type ScheduleEntry } from '../api/data'
import { useNavigate } from 'react-router-dom'
import { clearToken } from '../api/auth'

const DAY_LABELS = ['', '一', '二', '三', '四', '五', '六', '日']

const PERIOD_NUM: Record<string, number> = {
  '第一節': 1, '第二節': 2, '第三節': 3, '第四節': 4, '第五節': 5,
  '第六節': 6, '第七節': 7, '第八節': 8, '第九節': 9, '第十節': 10,
  '第十一節': 11, '第十二節': 12, '第十三節': 13, '第十四節': 14,
}

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

type CellData = { course: string; teacher: string; classroom: string; time_range: string }

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
  useEffect(() => {
    if (opts && opts.length > 0 && !semester) setSemester(opts[0].value)
  }, [opts])

  const grid: Record<number, Record<number, CellData>> = {}
  for (let d = 1; d <= 7; d++) grid[d] = {}
  const extras: ScheduleEntry[] = []
  const periodTimes: Record<number, string> = {}

  let maxPeriod = 0
  for (const e of entries ?? []) {
    const p = PERIOD_NUM[e.period]
    if (!p) { extras.push(e); continue }
    if (!grid[e.weekday]) grid[e.weekday] = {}
    grid[e.weekday][p] = { course: e.course, teacher: e.teacher, classroom: e.classroom, time_range: e.time_range }
    if (p > maxPeriod) maxPeriod = p
    if (!periodTimes[p] && e.time_range) periodTimes[p] = e.time_range
  }
  const totalPeriods = Math.max(maxPeriod, 9)

  const activeDays = [1, 2, 3, 4, 5, 6, 7].filter(d =>
    Object.keys(grid[d] ?? {}).length > 0
  )
  const displayDays = activeDays.length > 0 ? activeDays : [1, 2, 3, 4, 5]

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
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {!semester && <p className="text-gray-400 text-sm">請先選擇學期</p>}
      {semester && isLoading && <p className="text-gray-400 text-sm">載入中...</p>}

      {semester && !isLoading && entries && (
        entries.length === 0 ? (
          <p className="text-gray-400 text-sm">此學期無課表資料</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="border-collapse text-xs">
              <thead>
                <tr>
                  <th className="w-16 border border-gray-200 bg-gray-50 p-2 text-gray-500">節次</th>
                  {displayDays.map((d) => (
                    <th
                      key={d}
                      className="border border-gray-200 bg-gray-50 p-2 text-gray-700 font-medium w-28"
                    >
                      週{DAY_LABELS[d]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: totalPeriods }, (_, i) => i + 1).map((p) => (
                  <tr key={p}>
                    <td className="border border-gray-200 bg-gray-50 text-center p-1.5 w-16">
                      <div className="font-mono text-gray-500 text-xs">{p}</div>
                      {periodTimes[p] && (
                        <div className="text-gray-400 text-[10px] leading-tight mt-0.5 tabular-nums">{periodTimes[p]}</div>
                      )}
                    </td>
                    {displayDays.map((d) => {
                      const cell = grid[d]?.[p]
                      return (
                        <td
                          key={d}
                          className={`border border-gray-200 p-1.5 align-top ${cell ? 'bg-indigo-50' : ''}`}
                        >
                          {cell && (
                            <div>
                              <div className="font-medium text-indigo-800 leading-tight">{cell.course}</div>
                              {cell.teacher && <div className="text-gray-500 mt-0.5">{cell.teacher}</div>}
                              {cell.classroom && <div className="text-gray-400">{cell.classroom}</div>}
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
        )
      )}

      {extras.length > 0 && (
        <div className="mt-4">
          <p className="text-xs text-gray-400 mb-2">其他節次</p>
          <div className="space-y-1">
            {extras.map((e, i) => (
              <div key={i} className="text-xs bg-indigo-50 rounded px-3 py-1.5 flex gap-3">
                <span className="text-gray-500">週{DAY_LABELS[e.weekday]} {e.period}</span>
                <span className="font-medium text-indigo-800">{e.course}</span>
                {e.teacher && <span className="text-gray-500">{e.teacher}</span>}
                {e.classroom && <span className="text-gray-400">{e.classroom}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
