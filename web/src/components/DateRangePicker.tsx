import { toCEInput, todayRange, thisMonthRange, lastMonthRange } from '../utils/date'

interface DateRangePickerProps {
  start: string
  end: string
  onStartChange: (v: string) => void
  onEndChange: (v: string) => void
  onQuickApply?: (start: string, end: string) => void
}

export function DateRangePicker({
  start, end, onStartChange, onEndChange, onQuickApply,
}: DateRangePickerProps) {
  function applyRange([from, to]: [Date, Date]) {
    const s = toCEInput(from)
    const e = toCEInput(to)
    onStartChange(s)
    onEndChange(e)
    onQuickApply?.(s, e)
  }

  const inputCls = 'bg-zinc-800 border border-zinc-700 text-zinc-100 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 w-full sm:w-auto'

  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1.5">
        <label className="text-xs text-zinc-500">日期範圍</label>
        <button type="button" onClick={() => applyRange(todayRange())} className="text-xs text-orange-400 hover:text-orange-300 hover:underline">今天</button>
        <span className="text-zinc-700 text-xs">|</span>
        <button type="button" onClick={() => applyRange(thisMonthRange())} className="text-xs text-orange-400 hover:text-orange-300 hover:underline">本月</button>
        <span className="text-zinc-700 text-xs">|</span>
        <button type="button" onClick={() => applyRange(lastMonthRange())} className="text-xs text-orange-400 hover:text-orange-300 hover:underline">上個月</button>
      </div>
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
        <input type="date" value={start} onChange={e => onStartChange(e.target.value)} className={inputCls} />
        <span className="hidden sm:block text-zinc-600 text-sm">—</span>
        <input type="date" value={end} onChange={e => onEndChange(e.target.value)} className={inputCls} />
      </div>
    </div>
  )
}
