'use client'

import { useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { DateRangePicker } from '@/components/DateRangePicker'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { PageLayout } from '@/components/PageLayout'
import { ALL_PERIODS, ABSENCE_TYPE_CLS } from '@/constants'
import type { AbsenceEntry, AbsenceOptions } from '@/lib/data'

function typeCls(t: string) { return ABSENCE_TYPE_CLS[t] ?? 'bg-muted text-muted-foreground' }

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

interface AbsenceViewProps {
  options: AbsenceOptions
  entries: AbsenceEntry[]
  semester: string
  leaveType: string
  start: string
  end: string
}

export function AbsenceView({
  options,
  entries,
  semester: initSemester,
  leaveType: initLeaveType,
  start: initStart,
  end: initEnd,
}: AbsenceViewProps) {
  const router = useRouter()
  const pathname = usePathname()
  const [semester, setSemester] = useState(initSemester)
  const [leaveType, setLeaveType] = useState(initLeaveType)
  const [start, setStart] = useState(initStart)
  const [end, setEnd] = useState(initEnd)

  function navigate(s = semester, t = leaveType, st = start, en = end) {
    if (!s) return
    const params = new URLSearchParams({ semester: s, type: t, start: st, end: en })
    router.push(`${pathname}?${params}`)
  }

  const pivot = buildPivot(entries)
  const activePeriods = ALL_PERIODS.filter(p => entries.some(e => e.period === p))

  return (
    <PageLayout>
      <PageLayout.Trend>
        <PageLayout.TrendCard title="缺曠天數" value={pivot.length} sub="天" />
        <PageLayout.TrendCard title="缺曠節次" value={entries.length} sub="節" />
        <PageLayout.TrendCard title="最常假別" value={mostCommonType(entries)} />
      </PageLayout.Trend>

      <PageLayout.Toolbar>
        <div>
          <label className="block text-xs text-muted-foreground mb-1">學期</label>
          <Select value={semester} onValueChange={v => v != null && setSemester(v)}>
            <SelectTrigger className="w-40">
              <SelectValue
                displayValue={options.semesters.find(o => o.value === semester)?.label}
                placeholder="選擇學期"
              />
            </SelectTrigger>
            <SelectContent>
              {options.semesters.map(o => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="block text-xs text-muted-foreground mb-1">假別</label>
          <Select value={leaveType} onValueChange={v => v != null && setLeaveType(v)}>
            <SelectTrigger className="w-28">
              <SelectValue displayValue={options.leave_types.find(t => t.value === leaveType)?.label} />
            </SelectTrigger>
            <SelectContent>
              {(options.leave_types.length ? options.leave_types : [{ value: '00', label: '全部' }]).map(t => (
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
          onQuickApply={(s, e) => navigate(semester, leaveType, s, e)}
        />

        <Button
          onClick={() => navigate()}
          disabled={!semester}
          className="bg-primary hover:bg-primary/90 text-white self-end"
        >
          查詢
        </Button>
      </PageLayout.Toolbar>

      <PageLayout.Table>
        {pivot.length === 0 ? (
          <p className="text-muted-foreground/70 text-sm text-center py-8">此區間無記錄</p>
        ) : (
          <table className="text-xs border-collapse w-full whitespace-nowrap">
            <thead>
              <tr className="bg-muted/30 border-b border-border">
                <th className="px-3 py-2 text-left font-medium text-muted-foreground sticky left-0 bg-card z-10 border-r border-border w-8">項次</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground sticky left-8 bg-card z-10 border-r border-border min-w-32">日期</th>
                {activePeriods.map(p => (
                  <th key={p} className="px-2 py-2 text-center font-medium text-muted-foreground min-w-11">{p}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pivot.map(([date, { weekday, cells }], idx) => (
                <tr key={date} className="border-b border-border/60 last:border-0 hover:bg-accent/30 transition-colors">
                  <td className="px-3 py-2 text-muted-foreground/70 tabular-nums text-center sticky left-0 bg-card border-r border-border">{idx + 1}</td>
                  <td className="px-3 py-2 text-foreground/80 tabular-nums sticky left-8 bg-card border-r border-border">
                    {date}<span className="text-muted-foreground/70 ml-1.5">（{weekday}）</span>
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
              <tr className="border-t border-border/60 bg-muted/30">
                <td colSpan={2 + activePeriods.length} className="px-3 py-2 text-xs text-muted-foreground/70">
                  共 {pivot.length} 天・{entries.length} 節次
                </td>
              </tr>
            </tfoot>
          </table>
        )}
      </PageLayout.Table>
    </PageLayout>
  )
}
