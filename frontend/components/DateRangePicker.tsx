'use client'

import { toCEInput, todayRange, thisMonthRange, lastMonthRange } from '@/lib/date'

interface DateRangePickerProps {
  start: string
  end: string
  onStartChange: (v: string) => void
  onEndChange: (v: string) => void
  onQuickApply?: (start: string, end: string) => void
}

const dateCls = 'bg-white border border-stone-300 text-stone-900 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400/50 w-full sm:w-auto'
const quickCls = 'text-xs text-orange-500 hover:text-orange-600 hover:underline transition-colors'

export function DateRangePicker({ start, end, onStartChange, onEndChange, onQuickApply }: DateRangePickerProps) {
  function applyRange([from, to]: [Date, Date]) {
    const s = toCEInput(from)
    const e = toCEInput(to)
    onStartChange(s)
    onEndChange(e)
    onQuickApply?.(s, e)
  }

  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1.5">
        <label className="text-xs text-stone-500">日期範圍</label>
        <button type="button" onClick={() => applyRange(todayRange())} className={quickCls}>今天</button>
        <span className="text-stone-300 text-xs">|</span>
        <button type="button" onClick={() => applyRange(thisMonthRange())} className={quickCls}>本月</button>
        <span className="text-stone-300 text-xs">|</span>
        <button type="button" onClick={() => applyRange(lastMonthRange())} className={quickCls}>上個月</button>
      </div>
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
        <input type="date" value={start} onChange={e => onStartChange(e.target.value)} className={dateCls} />
        <span className="hidden sm:block text-stone-300 text-sm">—</span>
        <input type="date" value={end} onChange={e => onEndChange(e.target.value)} className={dateCls} />
      </div>
    </div>
  )
}
