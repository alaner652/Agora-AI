'use client'

import { useEffect, useState } from 'react'
import type { ScheduleEntry } from '@/lib/data'

const DAY_SHORT = ['', '一', '二', '三', '四', '五', '六', '日']
const HOUR_HEIGHT = 64  // px per hour

const PALETTE = [
  '#f97316', '#0ea5e9', '#10b981', '#8b5cf6',
  '#ec4899', '#f59e0b', '#14b8a6', '#ef4444',
]

function hashCourse(course: string): string {
  let h = 0
  for (const c of course) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return PALETTE[h % PALETTE.length]
}

function parseRange(range: string): { start: number; end: number } | null {
  // HHMM-HHMM format (backend)
  const m4 = range.match(/(\d{4})-(\d{4})/)
  if (m4) {
    const s = parseInt(m4[1].slice(0, 2)) * 60 + parseInt(m4[1].slice(2))
    const e = parseInt(m4[2].slice(0, 2)) * 60 + parseInt(m4[2].slice(2))
    if (e > s) return { start: s, end: e }
  }
  // HH:MM-HH:MM fallback
  const m5 = range.match(/(\d{1,2}:\d{2})-(\d{1,2}:\d{2})/)
  if (m5) {
    const [h1, mm1] = m5[1].split(':').map(Number)
    const [h2, mm2] = m5[2].split(':').map(Number)
    const s = h1 * 60 + mm1, e = h2 * 60 + mm2
    if (e > s) return { start: s, end: e }
  }
  return null
}

interface Block {
  weekday: number
  course: string
  teacher: string
  classroom: string
  start: number
  end: number
  color: string
}

/**
 * Merge same-course consecutive periods on the same weekday into one block.
 * Gap ≤ 20 min between end of one period and start of next is considered consecutive.
 */
function buildBlocks(entries: ScheduleEntry[]): Block[] {
  type Span = { start: number; end: number; teacher: string; classroom: string }
  const map = new Map<string, Span[]>()

  for (const e of entries) {
    const r = parseRange(e.time_range)
    if (!r) continue
    const key = `${e.weekday}|||${e.course}`
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push({ start: r.start, end: r.end, teacher: e.teacher, classroom: e.classroom })
  }

  const blocks: Block[] = []
  for (const [key, spans] of map) {
    const [wdStr, course] = key.split('|||')
    const weekday = parseInt(wdStr)
    spans.sort((a, b) => a.start - b.start)

    let cur = { ...spans[0] }
    for (let i = 1; i < spans.length; i++) {
      const next = spans[i]
      if (next.start - cur.end <= 20) {
        // Consecutive periods → extend current block
        cur.end = Math.max(cur.end, next.end)
      } else {
        blocks.push({ weekday, course, teacher: cur.teacher, classroom: cur.classroom, start: cur.start, end: cur.end, color: hashCourse(course) })
        cur = { ...next }
      }
    }
    blocks.push({ weekday, course, teacher: cur.teacher, classroom: cur.classroom, start: cur.start, end: cur.end, color: hashCourse(course) })
  }
  return blocks
}

/** Compute the visible hour range from actual data, with 30 min padding. */
function visibleRange(blocks: Block[]): { startHour: number; endHour: number } {
  if (blocks.length === 0) return { startHour: 8, endHour: 18 }
  const earliest = Math.min(...blocks.map(b => b.start))
  const latest = Math.max(...blocks.map(b => b.end))
  const startHour = Math.max(7, Math.floor((earliest - 30) / 60))
  const endHour = Math.min(22, Math.ceil((latest + 30) / 60))
  return { startHour, endHour }
}

interface Props { entries: ScheduleEntry[] }

export function ScheduleCalendar({ entries }: Props) {
  const [view, setView] = useState<'week' | 'day'>('week')
  const [selectedDay, setSelectedDay] = useState<number>(1)
  const [nowPx, setNowPx] = useState<number | null>(null)
  const [todayWeekday, setTodayWeekday] = useState(1)

  const blocks = buildBlocks(entries)
  const { startHour, endHour } = visibleRange(blocks)
  const TOTAL_MINUTES = (endHour - startHour) * 60
  const TOTAL_HEIGHT = (endHour - startHour) * HOUR_HEIGHT
  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i)

  function toPx(minutes: number): number {
    return ((minutes - startHour * 60) / TOTAL_MINUTES) * TOTAL_HEIGHT
  }

  useEffect(() => {
    const tick = () => {
      const now = new Date()
      const mins = now.getHours() * 60 + now.getMinutes()
      setNowPx(mins >= startHour * 60 && mins < endHour * 60 ? toPx(mins) : null)
      const d = now.getDay()
      const wd = d === 0 ? 7 : d
      setTodayWeekday(wd)
      setSelectedDay(v => v === 1 ? wd : v)
    }
    tick()
    const id = setInterval(tick, 60_000)
    return () => clearInterval(id)
  }, [startHour, endHour])

  const activeDays = [...new Set(entries.map(e => e.weekday))].sort()
  const displayDays = activeDays.length > 0 ? activeDays : [1, 2, 3, 4, 5]
  const daysToShow = view === 'day' ? [selectedDay] : displayDays

  return (
    <div className="flex flex-col gap-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg border border-border overflow-hidden text-xs shrink-0">
          {(['week', 'day'] as const).map(v => (
            <button key={v} onClick={() => setView(v)}
              className={`px-3 py-1.5 transition-colors ${view === v
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-accent'}`}>
              {v === 'week' ? '週' : '日'}
            </button>
          ))}
        </div>

        {view === 'day' && (
          <div className="flex gap-1 flex-wrap">
            {displayDays.map(d => (
              <button key={d} onClick={() => setSelectedDay(d)}
                className={`w-8 h-8 rounded-full text-xs font-medium transition-colors ${
                  selectedDay === d
                    ? 'bg-primary text-primary-foreground'
                    : d === todayWeekday
                    ? 'border border-primary text-primary hover:bg-accent'
                    : 'text-muted-foreground hover:bg-accent'
                }`}>
                {DAY_SHORT[d]}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Calendar */}
      <div className="rounded-xl border border-border bg-card/70 overflow-hidden backdrop-blur-xl">
        <div className="overflow-auto"
          style={{ maxHeight: 'calc(100dvh - 18rem)' }}>
          <div className="relative"
            style={{ minWidth: `${daysToShow.length * 120 + 48}px` }}>

            {/* Sticky header — no pointer events, no hover */}
            <div className="sticky top-0 z-20 flex border-b border-border bg-card pointer-events-none">
              {/* Corner: sticky both top and left */}
              <div className="w-12 shrink-0 sticky left-0 z-30 bg-card border-r border-border" />
              {daysToShow.map(d => (
                <div key={d}
                  className="flex-1 h-10 relative flex items-center justify-center border-r border-border last:border-r-0 select-none">
                  <span className={`text-xs font-medium
                    ${d === todayWeekday ? 'text-primary' : 'text-muted-foreground'}`}>
                    週{DAY_SHORT[d]}
                  </span>
                  {d === todayWeekday && (
                    <span className="absolute bottom-0 left-3 right-3 h-px bg-primary" />
                  )}
                </div>
              ))}
            </div>

            {/* Body */}
            <div className="flex" style={{ height: TOTAL_HEIGHT }}>
              {/* Time axis — sticky left so it stays visible during horizontal scroll */}
              <div className="w-12 shrink-0 sticky left-0 z-10 bg-card border-r border-border">
                {hours.map(h => (
                  <div key={h}
                    className="absolute inset-x-0 flex justify-end pr-2 pointer-events-none"
                    style={{ top: toPx(h * 60) + 3 }}>
                    <span className="text-[10px] tabular-nums leading-none text-muted-foreground/50">
                      {String(h).padStart(2, '0')}
                    </span>
                  </div>
                ))}
              </div>

              {/* Day columns */}
              {daysToShow.map(day => {
                const dayBlocks = blocks.filter(b => b.weekday === day)
                const isToday = day === todayWeekday
                return (
                  <div key={day}
                    className={`flex-1 relative border-r border-border last:border-r-0
                      ${isToday ? 'bg-primary/3' : ''}`}>

                    {/* Hour grid lines */}
                    {hours.map(h => (
                      <div key={h}
                        className="absolute inset-x-0 border-t border-border/25 pointer-events-none"
                        style={{ top: toPx(h * 60) }} />
                    ))}

                    {/* Half-hour lines (subtler) */}
                    {hours.map(h => (
                      <div key={`${h}.5`}
                        className="absolute inset-x-0 border-t border-border/10 pointer-events-none"
                        style={{ top: toPx(h * 60 + 30) }} />
                    ))}

                    {/* Current time line */}
                    {isToday && nowPx !== null && (
                      <div className="absolute inset-x-0 z-10 pointer-events-none flex items-center"
                        style={{ top: nowPx }}>
                        <div className="w-2 h-2 rounded-full bg-red-500 shrink-0 -ml-1" />
                        <div className="flex-1 h-px bg-red-500/80" />
                      </div>
                    )}

                    {/* Course blocks */}
                    {dayBlocks.map((block, idx) => {
                      const top = toPx(block.start)
                      const height = Math.max(toPx(block.end) - top, 22)
                      const { color } = block
                      const fmt = (m: number) => `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`
                      const timeStr = `${fmt(block.start)}–${fmt(block.end)}`
                      return (
                        <div key={idx}
                          className="absolute inset-x-1 rounded overflow-hidden text-[11px] leading-snug cursor-default select-none"
                          style={{
                            top: top + 2,
                            height: height - 4,
                            backgroundColor: `${color}18`,
                            borderLeft: `3px solid ${color}bb`,
                          }}
                          title={[block.course, block.classroom, block.teacher, timeStr].filter(Boolean).join('\n')}>
                          <div className="px-1.5 py-1 h-full overflow-hidden flex flex-col gap-0.5">
                            {/* Course name — always shown */}
                            <div className="font-semibold truncate text-[11px]" style={{ color }}>
                              {block.course}
                            </div>
                            {/* Time — shown when there's any room */}
                            {height > 28 && (
                              <div className="text-muted-foreground/60 truncate text-[10px] tabular-nums">
                                {timeStr}
                              </div>
                            )}
                            {/* Classroom */}
                            {height > 52 && block.classroom && (
                              <div className="text-muted-foreground/60 truncate text-[10px]">
                                {block.classroom}
                              </div>
                            )}
                            {/* Teacher */}
                            {height > 74 && block.teacher && (
                              <div className="text-muted-foreground/50 truncate text-[10px]">
                                {block.teacher}
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
