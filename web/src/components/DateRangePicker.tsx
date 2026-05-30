import { toCEInput, todayRange, thisMonthRange, lastMonthRange } from '../utils/date'

interface DateRangePickerProps {
  start: string
  end: string
  onStartChange: (v: string) => void
  onEndChange: (v: string) => void
  /** Called with (start, end) when a quick-select button is clicked. Use to auto-trigger queries. */
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

  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1">
        <label className="text-xs text-gray-500">日期範圍</label>
        <button type="button" onClick={() => applyRange(todayRange())} className="text-xs text-indigo-600 hover:underline">今天</button>
        <span className="text-gray-300 text-xs">|</span>
        <button type="button" onClick={() => applyRange(thisMonthRange())} className="text-xs text-indigo-600 hover:underline">本月</button>
        <span className="text-gray-300 text-xs">|</span>
        <button type="button" onClick={() => applyRange(lastMonthRange())} className="text-xs text-indigo-600 hover:underline">上個月</button>
      </div>
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
        <input
          type="date"
          value={start}
          onChange={(e) => onStartChange(e.target.value)}
          className="w-full sm:w-auto border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <span className="hidden sm:block text-gray-400 text-sm">—</span>
        <input
          type="date"
          value={end}
          onChange={(e) => onEndChange(e.target.value)}
          className="w-full sm:w-auto border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>
    </div>
  )
}
