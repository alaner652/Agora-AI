import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getAbsenceOptions, getAbsence, type AbsenceEntry, type AbsenceOptions } from '../api/data'
import { toCEInput, inputValToRoc, thisMonthRange } from '../utils/date'
import { DateRangePicker } from '../components/DateRangePicker'
import { useSessionGuard } from '../utils/hooks'

const ALL_PERIODS = ["朝會","自","1","2","3","4","5","6","7","8","9","K","A","B","C","D","E"]

const TYPE_CLS: Record<string, string> = {
  '缺曠': 'bg-red-100 text-red-700',
  '病假': 'bg-orange-100 text-orange-700',
  '事假': 'bg-yellow-100 text-yellow-700',
  '公假': 'bg-blue-100 text-blue-700',
  '喪假': 'bg-purple-100 text-purple-700',
}
function typeCls(t: string) { return TYPE_CLS[t] ?? 'bg-gray-100 text-gray-600' }

type PivotRow = { weekday: string; cells: Record<string, string> }

function buildPivot(entries: AbsenceEntry[]): [string, PivotRow][] {
  const map = new Map<string, PivotRow>()
  for (const e of entries) {
    if (!map.has(e.date)) map.set(e.date, { weekday: e.weekday, cells: {} })
    map.get(e.date)!.cells[e.period] = e.type
  }
  return [...map.entries()]
}

export default function AbsencePage() {
  const [semester, setSemester] = useState('')
  const [start, setStart] = useState(() => toCEInput(thisMonthRange()[0]))
  const [end,   setEnd  ] = useState(() => toCEInput(thisMonthRange()[1]))
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

  useEffect(() => {
    if (opts?.semesters && opts.semesters.length > 0 && !semester) {
      const current = opts.semesters.find(s => s.selected) ?? opts.semesters[0]
      setSemester(current.value)
      setQuery({ semester: current.value, start: inputValToRoc(start), end: inputValToRoc(end), type: leaveType })
    }
  }, [opts])

  function handleSearch() {
    if (!semester) return
    setQuery({ semester, start: inputValToRoc(start), end: inputValToRoc(end), type: leaveType })
  }

  const pivot = entries ? buildPivot(entries) : []
  const activePeriods = ALL_PERIODS.filter(p => entries?.some(e => e.period === p))

  return (
    <div className="p-6">
      <h2 className="text-xl font-semibold text-gray-900 mb-6">缺曠</h2>

      {/* Filters */}
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

        <DateRangePicker
          start={start}
          end={end}
          onStartChange={setStart}
          onEndChange={setEnd}
          onQuickApply={(s, e) => {
            if (semester) setQuery({ semester, start: inputValToRoc(s), end: inputValToRoc(e), type: leaveType })
          }}
        />

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
          {pivot.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-8">此區間無記錄</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="text-xs border-collapse w-full whitespace-nowrap">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="px-3 py-2 text-left font-medium text-gray-600 sticky left-0 bg-gray-50 z-10 border-r border-gray-200 w-8">項次</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-600 sticky left-8 bg-gray-50 z-10 border-r border-gray-200 min-w-32">日期</th>
                      {activePeriods.map(p => (
                        <th key={p} className="px-2 py-2 text-center font-medium text-gray-600 min-w-11">{p}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pivot.map(([date, { weekday, cells }], idx) => (
                      <tr key={date} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                        <td className="px-3 py-2 text-gray-400 tabular-nums text-center sticky left-0 bg-white hover:bg-gray-50 border-r border-gray-100">{idx + 1}</td>
                        <td className="px-3 py-2 text-gray-700 tabular-nums sticky left-8 bg-white hover:bg-gray-50 border-r border-gray-100">
                          {date}<span className="text-gray-400 ml-1.5">（{weekday}）</span>
                        </td>
                        {activePeriods.map(p => (
                          <td key={p} className="px-1.5 py-2 text-center">
                            {cells[p] ? (
                              <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium ${typeCls(cells[p])}`}>
                                {cells[p]}
                              </span>
                            ) : null}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-gray-200 bg-gray-50">
                      <td colSpan={2 + activePeriods.length} className="px-3 py-2 text-xs text-gray-400">
                        共 {pivot.length} 天・{entries.length} 節次
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
