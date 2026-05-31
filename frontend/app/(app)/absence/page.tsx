'use client'

import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import {
  getAbsenceOptions, getAbsence,
  type AbsenceEntry, type AbsenceOptions,
} from '@/lib/data'
import { toCEInput, inputValToRoc, thisMonthRange } from '@/lib/date'
import { DateRangePicker } from '@/components/DateRangePicker'
import { deleteCookie } from '@/lib/cookie'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { PageLayout } from '@/components/PageLayout'
import { ALL_PERIODS, ABSENCE_TYPE_CLS } from '@/lib/constants'

function typeCls(t: string) { return ABSENCE_TYPE_CLS[t] ?? 'bg-stone-100 text-stone-500' }

function mostCommonType(entries: AbsenceEntry[]): string {
  if (!entries.length) return '—'
  const counts: Record<string, number> = {}
  for (const e of entries) counts[e.type] = (counts[e.type] ?? 0) + 1
  return Object.entries(counts).sort(([, a], [, b]) => b - a)[0]?.[0] ?? '—'
}

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
  const router = useRouter()
  const [semester, setSemester] = useState('')
  const [start, setStart] = useState(() => toCEInput(thisMonthRange()[0]))
  const [end, setEnd] = useState(() => toCEInput(thisMonthRange()[1]))
  const [leaveType, setLeaveType] = useState('00')
  const [query, setQuery] = useState<{ semester: string; start: string; end: string; type: string } | null>(null)

  function onAuthErr() {
    deleteCookie('token')
    router.push('/login')
  }

  const { data: opts, error: optsErr } = useQuery<AbsenceOptions>({
    queryKey: ['absence-options'],
    queryFn: getAbsenceOptions,
  })

  const { data: entries, isLoading, error: absErr } = useQuery<AbsenceEntry[]>({
    queryKey: ['absence', query],
    queryFn: () => getAbsence(query!.semester, query!.start, query!.end, query!.type),
    enabled: !!query,
  })

  useEffect(() => {
    const code = (optsErr as { response?: { data?: { detail?: { error_code?: string } } } })
      ?.response?.data?.detail?.error_code
    if (code === 'AUTH_002' || code === 'NET_002') onAuthErr()
  }, [optsErr])

  useEffect(() => {
    const code = (absErr as { response?: { data?: { detail?: { error_code?: string } } } })
      ?.response?.data?.detail?.error_code
    if (code === 'AUTH_002' || code === 'NET_002') onAuthErr()
  }, [absErr])

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
    <PageLayout>
      {entries && (
        <PageLayout.Trend>
          <PageLayout.TrendCard title="缺曠天數" value={pivot.length} sub="天" />
          <PageLayout.TrendCard title="缺曠節次" value={entries.length} sub="節" />
          <PageLayout.TrendCard title="最常假別" value={mostCommonType(entries)} />
        </PageLayout.Trend>
      )}

      <PageLayout.Toolbar>
        <div>
          <label className="block text-xs text-stone-500 mb-1">學期</label>
          <Select value={semester} onValueChange={v => v != null && setSemester(v)}>
            <SelectTrigger className="w-40">
              <SelectValue
                displayValue={opts?.semesters.find(o => o.value === semester)?.label}
                placeholder="選擇學期"
              />
            </SelectTrigger>
            <SelectContent>
              {(opts?.semesters ?? []).map(o => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="block text-xs text-stone-500 mb-1">假別</label>
          <Select value={leaveType} onValueChange={v => v != null && setLeaveType(v)}>
            <SelectTrigger className="w-28">
              <SelectValue displayValue={opts?.leave_types.find(t => t.value === leaveType)?.label} />
            </SelectTrigger>
            <SelectContent>
              {(opts?.leave_types ?? [{ value: '00', label: '全部' }]).map(t => (
                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
              ))}
            </SelectContent>
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

        <Button
          onClick={handleSearch}
          disabled={!semester}
          className="bg-indigo-500 hover:bg-indigo-600 text-white self-end"
        >
          查詢
        </Button>
      </PageLayout.Toolbar>

      <PageLayout.Table loading={isLoading}>
        {pivot.length === 0 ? (
          <p className="text-stone-400 text-sm text-center py-8">此區間無記錄</p>
        ) : (
          <table className="text-xs border-collapse w-full whitespace-nowrap">
            <thead>
              <tr className="bg-stone-50 border-b border-stone-200">
                <th className="px-3 py-2 text-left font-medium text-stone-500 sticky left-0 bg-stone-50 z-10 border-r border-stone-200 w-8">項次</th>
                <th className="px-3 py-2 text-left font-medium text-stone-500 sticky left-8 bg-stone-50 z-10 border-r border-stone-200 min-w-32">日期</th>
                {activePeriods.map(p => (
                  <th key={p} className="px-2 py-2 text-center font-medium text-stone-500 min-w-11">{p}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pivot.map(([date, { weekday, cells }], idx) => (
                <tr key={date} className="border-b border-stone-100 last:border-0 hover:bg-stone-50">
                  <td className="px-3 py-2 text-stone-400 tabular-nums text-center sticky left-0 bg-white border-r border-stone-200">{idx + 1}</td>
                  <td className="px-3 py-2 text-stone-700 tabular-nums sticky left-8 bg-white border-r border-stone-200">
                    {date}<span className="text-stone-400 ml-1.5">（{weekday}）</span>
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
              <tr className="border-t border-stone-100 bg-stone-50">
                <td colSpan={2 + activePeriods.length} className="px-3 py-2 text-xs text-stone-400">
                  共 {pivot.length} 天・{entries!.length} 節次
                </td>
              </tr>
            </tfoot>
          </table>
        )}
      </PageLayout.Table>
    </PageLayout>
  )
}
