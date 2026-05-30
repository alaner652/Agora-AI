import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getAbsenceOptions, getAbsence, type AbsenceEntry, type AbsenceOptions } from '../api/data'
import { toCEInput, inputValToRoc, thisMonthRange } from '../utils/date'
import { DateRangePicker } from '../components/DateRangePicker'
import { useSessionGuard } from '../utils/hooks'
import { Button, Select, Spinner } from '../components/ui'
import { PageShell } from '../components/PageShell'

const ALL_PERIODS = ["朝會","自","1","2","3","4","5","6","7","8","9","K","A","B","C","D","E"]

const TYPE_CLS: Record<string, string> = {
  '缺曠': 'bg-red-500/15 text-red-400',
  '病假': 'bg-orange-500/15 text-orange-400',
  '事假': 'bg-amber-500/15 text-amber-400',
  '公假': 'bg-sky-500/15 text-sky-400',
  '喪假': 'bg-purple-500/15 text-purple-400',
}
function typeCls(t: string) { return TYPE_CLS[t] ?? 'bg-zinc-700 text-zinc-400' }

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
    <PageShell title="缺曠">
      <div className="flex flex-wrap items-end gap-3 mb-6">
        <div>
          <label className="block text-xs text-zinc-500 mb-1">學期</label>
          <Select value={semester} onChange={e => setSemester(e.target.value)}>
            <option value="">選擇學期</option>
            {(opts?.semesters ?? []).map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>
        </div>

        <div>
          <label className="block text-xs text-zinc-500 mb-1">假別</label>
          <Select value={leaveType} onChange={e => setLeaveType(e.target.value)}>
            {(opts?.leave_types ?? [{ value: '00', label: '全部' }]).map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </Select>
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

        <Button onClick={handleSearch} disabled={!semester}>查詢</Button>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 text-zinc-500 text-sm">
          <Spinner className="w-4 h-4" />載入中...
        </div>
      )}

      {!isLoading && entries && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          {pivot.length === 0 ? (
            <p className="text-zinc-500 text-sm text-center py-8">此區間無記錄</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="text-xs border-collapse w-full whitespace-nowrap">
                <thead>
                  <tr className="bg-zinc-800/60 border-b border-zinc-800">
                    <th className="px-3 py-2 text-left font-medium text-zinc-400 sticky left-0 bg-zinc-800/60 z-10 border-r border-zinc-800 w-8">項次</th>
                    <th className="px-3 py-2 text-left font-medium text-zinc-400 sticky left-8 bg-zinc-800/60 z-10 border-r border-zinc-800 min-w-32">日期</th>
                    {activePeriods.map(p => (
                      <th key={p} className="px-2 py-2 text-center font-medium text-zinc-400 min-w-11">{p}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pivot.map(([date, { weekday, cells }], idx) => (
                    <tr key={date} className="border-b border-zinc-800 last:border-0 hover:bg-zinc-800/30">
                      <td className="px-3 py-2 text-zinc-600 tabular-nums text-center sticky left-0 bg-zinc-900 border-r border-zinc-800">{idx + 1}</td>
                      <td className="px-3 py-2 text-zinc-300 tabular-nums sticky left-8 bg-zinc-900 border-r border-zinc-800">
                        {date}<span className="text-zinc-600 ml-1.5">（{weekday}）</span>
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
                  <tr className="border-t border-zinc-800 bg-zinc-800/40">
                    <td colSpan={2 + activePeriods.length} className="px-3 py-2 text-xs text-zinc-500">
                      共 {pivot.length} 天・{entries.length} 節次
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}
    </PageShell>
  )
}
