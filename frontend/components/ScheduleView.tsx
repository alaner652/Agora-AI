'use client'

import { useState } from 'react'
import { LayoutGrid, CalendarDays } from 'lucide-react'
import type { ScheduleEntry, SemesterOption } from '@/lib/data'
import { DAY_LABELS, PERIOD_NUM } from '@/lib/constants'
import { PageLayout } from '@/components/PageLayout'
import { SemesterSelect } from '@/components/SemesterSelect'

type CellData = { course: string; teacher: string; classroom: string; time_range: string }

interface ScheduleViewProps {
  semester: string
  opts: SemesterOption[]
  entries: ScheduleEntry[]
  grid: Record<number, Record<number, CellData>>
  extras: ScheduleEntry[]
  periodTimes: Record<number, string>
  displayDays: number[]
  totalPeriods: number
  activeDays: number[]
}

// ── Time helpers ───────────────────────────────────────────────────────────────

function parseMin(s: string): number | null {
  const m = s.trim().match(/^(\d{1,2}):(\d{2})$/)
  return m ? parseInt(m[1]) * 60 + parseInt(m[2]) : null
}

function parseRange(r: string): { s: number; e: number } | null {
  if (!r) return null
  const m = r.match(/(\d{1,2}:\d{2})\s*[-–—]\s*(\d{1,2}:\d{2})/)
  if (!m) return null
  const s = parseMin(m[1])
  const e = parseMin(m[2])
  return s !== null && e !== null && e > s ? { s, e } : null
}

// ── Table View ─────────────────────────────────────────────────────────────────

function TableView({ grid, extras, displayDays, totalPeriods, periodTimes, entries, semester }: {
  grid: Record<number, Record<number, CellData>>
  extras: ScheduleEntry[]
  displayDays: number[]
  totalPeriods: number
  periodTimes: Record<number, string>
  entries: ScheduleEntry[]
  semester: string
}) {
  return (
    <>
      <PageLayout.Table>
        {!semester && <p className="text-stone-400 text-sm text-center py-8">請先選擇學期</p>}
        {semester && entries.length === 0 && (
          <p className="text-stone-400 text-sm text-center py-8">此學期無課表資料</p>
        )}
        {semester && entries.length > 0 && (
          <table className="border-collapse text-xs w-full table-fixed">
            <thead>
              <tr>
                <th className="border border-stone-200 bg-stone-50 p-1.5 text-stone-400 text-center w-12">節次</th>
                {displayDays.map(d => (
                  <th key={d} className="border border-stone-200 bg-stone-50 p-1.5 text-stone-700 font-medium text-center">
                    週{DAY_LABELS[d]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: totalPeriods }, (_, i) => i + 1).map(p => (
                <tr key={p}>
                  <td className="border border-stone-200 text-center p-1.5 h-12 align-middle w-12">
                    <div className="font-mono text-stone-400">{p}</div>
                    {periodTimes[p] && (
                      <div className="text-stone-300 text-[10px] leading-tight mt-0.5 tabular-nums">{periodTimes[p]}</div>
                    )}
                  </td>
                  {displayDays.map(d => {
                    const cell = grid[d]?.[p]
                    return (
                      <td key={d} className={`border border-stone-200 p-1.5 align-top h-12 ${cell ? 'bg-indigo-50' : ''}`}>
                        {cell && (
                          <div>
                            <div className="font-medium text-indigo-600 leading-tight truncate">{cell.course}</div>
                            {cell.teacher && <div className="text-stone-400 mt-0.5 truncate">{cell.teacher}</div>}
                            {cell.classroom && <div className="text-stone-400 truncate">{cell.classroom}</div>}
                          </div>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </PageLayout.Table>

      {extras.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs text-stone-400 mb-2">其他節次</p>
          {extras.map((e, i) => (
            <div key={i} className="text-xs bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-1.5 flex gap-3">
              <span className="text-stone-500">週{DAY_LABELS[e.weekday]} {e.period}</span>
              <span className="font-medium text-indigo-600">{e.course}</span>
              {e.teacher && <span className="text-stone-400">{e.teacher}</span>}
              {e.classroom && <span className="text-stone-400">{e.classroom}</span>}
            </div>
          ))}
        </div>
      )}
    </>
  )
}

// ── Calendar View (Google/Apple-style time grid) ──────────────────────────────

const HOUR_PX = 56

function CalendarView({ entries, extras, displayDays, periodTimes, semester }: {
  entries: ScheduleEntry[]
  extras: ScheduleEntry[]
  displayDays: number[]
  periodTimes: Record<number, string>
  semester: string
}) {
  // Resolve time range for an entry — use entry's own time_range first,
  // then fall back to the period's canonical time from periodTimes.
  function resolveTime(e: ScheduleEntry): string {
    if (e.time_range) return e.time_range
    const p = PERIOD_NUM[e.period]
    return (p && periodTimes[p]) || ''
  }

  // Compute hour bounds from all course times
  let minHour = 8
  let maxHour = 18
  for (const e of [...entries, ...extras]) {
    const r = parseRange(resolveTime(e))
    if (r) {
      minHour = Math.min(minHour, Math.floor(r.s / 60))
      maxHour = Math.max(maxHour, Math.ceil(r.e / 60))
    }
  }
  const startHour = Math.max(0, minHour - 1)
  const endHour = Math.min(24, maxHour + 1)
  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i)
  const totalH = hours.length * HOUR_PX

  // Today
  const todayDow = new Date().getDay()
  const todayWeekday = todayDow === 0 ? 7 : todayDow

  // Current time indicator
  const now = new Date()
  const nowMin = now.getHours() * 60 + now.getMinutes()
  const nowTop = (nowMin / 60 - startHour) * HOUR_PX
  const showNowLine = displayDays.includes(todayWeekday)
    && nowMin >= startHour * 60
    && nowMin <= endHour * 60

  if (!semester) {
    return (
      <div className="bg-white border border-stone-200 rounded-xl px-4 py-8 text-center text-stone-400 text-sm">
        請先選擇學期
      </div>
    )
  }
  if (entries.length === 0) {
    return (
      <div className="bg-white border border-stone-200 rounded-xl px-4 py-8 text-center text-stone-400 text-sm">
        此學期無課表資料
      </div>
    )
  }

  return (
    <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
      {/* Sticky day headers */}
      <div className="flex border-b border-stone-100 bg-stone-50 sticky top-0 z-20">
        <div className="w-10 shrink-0" />
        {displayDays.map(d => {
          const isToday = d === todayWeekday
          return (
            <div key={d} className={`flex-1 py-2.5 text-center border-l border-stone-100 ${isToday ? 'bg-indigo-50' : ''}`}>
              <span className={`text-xs font-medium ${isToday ? 'text-indigo-500' : 'text-stone-500'}`}>
                週{DAY_LABELS[d]}
              </span>
              {isToday && <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 mx-auto mt-0.5" />}
            </div>
          )
        })}
      </div>

      {/* Scrollable time grid */}
      <div className="overflow-x-auto overflow-y-auto max-h-[560px]">
        <div className="flex" style={{ height: totalH, minWidth: `${40 + displayDays.length * 72}px` }}>
          {/* Hour labels */}
          <div className="w-10 shrink-0 relative select-none">
            {hours.map((h, i) => (
              <div key={h} className="absolute right-1.5" style={{ top: i * HOUR_PX - 7 }}>
                <span className="text-[10px] text-stone-300 tabular-nums">{String(h).padStart(2, '0')}:00</span>
              </div>
            ))}
          </div>

          {/* Day columns */}
          {displayDays.map(d => {
            const isToday = d === todayWeekday
            // Regular entries for this day (exclude extras)
            const dayEntries = entries.filter(e => e.weekday === d && !!PERIOD_NUM[e.period])
            // Extras that happen to have a parseable time_range
            const dayExtras = extras.filter(e => e.weekday === d && !!parseRange(e.time_range))

            return (
              <div key={d} className={`flex-1 relative border-l border-stone-100 ${isToday ? 'bg-indigo-50/20' : ''}`}>
                {/* Hour grid lines */}
                {hours.map((_, i) => (
                  <div key={i} className="absolute w-full border-t border-stone-100" style={{ top: i * HOUR_PX }} />
                ))}
                {/* Half-hour lines */}
                {hours.map((_, i) => (
                  <div key={`hf${i}`} className="absolute w-full border-t border-stone-50" style={{ top: i * HOUR_PX + HOUR_PX / 2 }} />
                ))}

                {/* Current time indicator */}
                {isToday && showNowLine && (
                  <div className="absolute w-full z-10 flex items-center" style={{ top: nowTop }}>
                    <div className="w-2.5 h-2.5 rounded-full bg-red-400 shrink-0 -ml-1.5 z-10" />
                    <div className="flex-1 border-t-2 border-red-400" />
                  </div>
                )}

                {/* Regular course blocks */}
                {dayEntries.map((e, i) => {
                  const timeStr = resolveTime(e)
                  const r = parseRange(timeStr)
                  if (!r) return null

                  const top = (r.s / 60 - startHour) * HOUR_PX + 2
                  const height = Math.max(((r.e - r.s) / 60) * HOUR_PX - 4, 20)

                  return (
                    <div key={i}
                      className="absolute inset-x-1 rounded-lg bg-indigo-500 text-white overflow-hidden z-10"
                      style={{ top, height }}
                    >
                      <div className="p-1.5 h-full flex flex-col overflow-hidden">
                        <div className="text-[11px] font-semibold leading-tight line-clamp-2">{e.course}</div>
                        {height > 44 && (
                          <div className="text-[9px] opacity-60 mt-0.5 tabular-nums">{timeStr}</div>
                        )}
                        {height > 60 && (e.teacher || e.classroom) && (
                          <div className="text-[9px] opacity-60 mt-auto truncate">
                            {[e.teacher, e.classroom].filter(Boolean).join(' · ')}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}

                {/* Extras with parseable time */}
                {dayExtras.map((e, i) => {
                  const r = parseRange(e.time_range)!
                  const top = (r.s / 60 - startHour) * HOUR_PX + 2
                  const height = Math.max(((r.e - r.s) / 60) * HOUR_PX - 4, 20)
                  return (
                    <div key={`x${i}`}
                      className="absolute inset-x-1 rounded-lg bg-amber-400 text-white overflow-hidden z-10"
                      style={{ top, height }}
                    >
                      <div className="p-1.5 text-[11px] font-semibold leading-tight truncate">{e.course}</div>
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── Main Export ────────────────────────────────────────────────────────────────

export function ScheduleView({
  semester, opts, entries, grid, extras, periodTimes, displayDays, totalPeriods, activeDays,
}: ScheduleViewProps) {
  const [view, setView] = useState<'table' | 'calendar'>('calendar')
  const uniqueCourses = new Set(entries.map(e => e.course)).size

  return (
    <PageLayout>
      {semester && entries.length > 0 && (
        <PageLayout.Trend>
          <PageLayout.TrendCard title="課程數" value={uniqueCourses} sub="門" />
          <PageLayout.TrendCard title="上課節次" value={entries.length} sub="節 / 週" />
          <PageLayout.TrendCard title="上課天數" value={activeDays.length} sub="天 / 週" />
        </PageLayout.Trend>
      )}

      <PageLayout.Toolbar>
        <div>
          <label className="block text-xs text-stone-500 mb-1">學期</label>
          <SemesterSelect options={opts} current={semester} />
        </div>

        <div className="ml-auto self-end flex rounded-lg border border-stone-200 overflow-hidden">
          <button type="button" onClick={() => setView('calendar')} title="行事曆視圖"
            className={`px-2.5 py-1.5 transition-colors ${view === 'calendar' ? 'bg-indigo-500 text-white' : 'bg-white text-stone-400 hover:bg-stone-50'}`}>
            <CalendarDays className="w-4 h-4" />
          </button>
          <button type="button" onClick={() => setView('table')} title="表格視圖"
            className={`px-2.5 py-1.5 border-l border-stone-200 transition-colors ${view === 'table' ? 'bg-indigo-500 text-white' : 'bg-white text-stone-400 hover:bg-stone-50'}`}>
            <LayoutGrid className="w-4 h-4" />
          </button>
        </div>
      </PageLayout.Toolbar>

      {view === 'calendar' ? (
        <CalendarView
          entries={entries}
          extras={extras}
          displayDays={displayDays}
          periodTimes={periodTimes}
          semester={semester}
        />
      ) : (
        <TableView
          grid={grid}
          extras={extras}
          displayDays={displayDays}
          totalPeriods={totalPeriods}
          periodTimes={periodTimes}
          entries={entries}
          semester={semester}
        />
      )}
    </PageLayout>
  )
}
