'use client'

import { useState } from 'react'
import { CalendarIcon } from 'lucide-react'
import { zhTW } from 'date-fns/locale'
import type { DateRange } from 'react-day-picker'
import { toCEInput, todayRange, thisMonthRange, lastMonthRange } from '@/lib/date'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

interface DateRangePickerProps {
  start: string
  end: string
  onStartChange: (v: string) => void
  onEndChange: (v: string) => void
  onQuickApply?: (start: string, end: string) => void
}

const quickCls = 'text-xs text-indigo-500 hover:text-indigo-600 hover:underline transition-colors'

function parseInputDate(s: string): Date | undefined {
  if (!s) return undefined
  const d = new Date(s + 'T00:00:00')
  return isNaN(d.getTime()) ? undefined : d
}

function formatDisplay(start: string, end: string): string {
  if (!start) return '選擇日期範圍'
  if (!end || start === end) return start
  return `${start} — ${end}`
}

export function DateRangePicker({
  start, end, onStartChange, onEndChange, onQuickApply,
}: DateRangePickerProps) {
  const [open, setOpen] = useState(false)

  const selected: DateRange = {
    from: parseInputDate(start),
    to: parseInputDate(end),
  }

  function handleSelect(range: DateRange | undefined) {
    const from = range?.from ? toCEInput(range.from) : ''
    const to = range?.to ? toCEInput(range.to) : from
    onStartChange(from)
    onEndChange(to)
    if (range?.from && range?.to) {
      onQuickApply?.(from, to)
      setOpen(false)
    }
  }

  function applyQuick([from, to]: [Date, Date]) {
    const s = toCEInput(from)
    const e = toCEInput(to)
    onStartChange(s)
    onEndChange(e)
    onQuickApply?.(s, e)
    setOpen(false)
  }

  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1.5">
        <label className="text-xs text-stone-500">日期範圍</label>
        <button type="button" onClick={() => applyQuick(todayRange())} className={quickCls}>今天</button>
        <span className="text-stone-300 text-xs">|</span>
        <button type="button" onClick={() => applyQuick(thisMonthRange())} className={quickCls}>本月</button>
        <span className="text-stone-300 text-xs">|</span>
        <button type="button" onClick={() => applyQuick(lastMonthRange())} className={quickCls}>上個月</button>
      </div>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger className="flex items-center gap-2 rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm text-stone-900 hover:bg-stone-50 focus:outline-none focus:ring-2 focus:ring-indigo-400/50 transition-colors">
          <CalendarIcon className="w-4 h-4 text-stone-400 shrink-0" />
          <span>{formatDisplay(start, end)}</span>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start" side="bottom" sideOffset={6}>
          <Calendar
            mode="range"
            selected={selected}
            onSelect={handleSelect}
            numberOfMonths={2}
            locale={zhTW}
          />
        </PopoverContent>
      </Popover>
    </div>
  )
}
