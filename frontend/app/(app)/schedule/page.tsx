import { serverFetch } from '@/lib/api-server'
import { PageLayout } from '@/components/PageLayout'
import { SemesterSelect } from '@/components/SemesterSelect'
import type { SemesterOption, ScheduleEntry } from '@/lib/data'
import { DAY_LABELS, PERIOD_NUM } from '@/lib/constants'

type CellData = { course: string; teacher: string; classroom: string; time_range: string }

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ semester?: string }>
}) {
  const params = await searchParams
  let opts: SemesterOption[] = []
  let entries: ScheduleEntry[] = []
  let fetchError = false

  try {
    const data = await serverFetch<{ semesters: SemesterOption[] }>('/api/semester-options')
    opts = data.semesters ?? []
  } catch {
    fetchError = true
  }

  const semester = params.semester ?? opts[0]?.value ?? ''

  if (semester && !fetchError) {
    try {
      const data = await serverFetch<{ entries: ScheduleEntry[] }>(`/api/schedule?semester=${encodeURIComponent(semester)}`)
      entries = data.entries ?? []
    } catch {
      fetchError = true
    }
  }

  if (fetchError) {
    return (
      <PageLayout>
        <p className="text-red-600 text-sm">載入失敗，請重新整理</p>
      </PageLayout>
    )
  }

  const grid: Record<number, Record<number, CellData>> = {}
  for (let d = 1; d <= 7; d++) grid[d] = {}
  const extras: ScheduleEntry[] = []
  const periodTimes: Record<number, string> = {}
  let maxPeriod = 0

  for (const e of entries) {
    const p = PERIOD_NUM[e.period]
    if (!p) { extras.push(e); continue }
    if (!grid[e.weekday]) grid[e.weekday] = {}
    grid[e.weekday][p] = { course: e.course, teacher: e.teacher, classroom: e.classroom, time_range: e.time_range }
    if (p > maxPeriod) maxPeriod = p
    if (!periodTimes[p] && e.time_range) periodTimes[p] = e.time_range
  }
  const totalPeriods = Math.max(maxPeriod, 9)

  const activeDays = [1, 2, 3, 4, 5, 6, 7].filter(d => Object.keys(grid[d] ?? {}).length > 0)
  const displayDays = activeDays.length > 0 ? activeDays : [1, 2, 3, 4, 5]
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
      </PageLayout.Toolbar>

      <PageLayout.Table>
        {!semester && <p className="text-stone-400 text-sm text-center py-8">請先選擇學期</p>}
        {semester && entries.length === 0 && (
          <p className="text-stone-400 text-sm text-center py-8">此學期無課表資料</p>
        )}
        {semester && entries.length > 0 && (
          <table className="border-collapse text-xs w-full">
            <thead>
              <tr>
                <th className="border border-stone-200 bg-stone-50 p-2 text-stone-400 w-14">節次</th>
                {displayDays.map(d => (
                  <th key={d} className="border border-stone-200 bg-stone-50 p-2 text-stone-700 font-medium w-28">
                    週{DAY_LABELS[d]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: totalPeriods }, (_, i) => i + 1).map(p => (
                <tr key={p}>
                  <td className="border border-stone-200 text-center p-1.5 w-14">
                    <div className="font-mono text-stone-400 text-xs">{p}</div>
                    {periodTimes[p] && (
                      <div className="text-stone-400 text-[10px] leading-tight mt-0.5 tabular-nums">{periodTimes[p]}</div>
                    )}
                  </td>
                  {displayDays.map(d => {
                    const cell = grid[d]?.[p]
                    return (
                      <td key={d} className={`border border-stone-200 p-1.5 align-top ${cell ? 'bg-indigo-50' : ''}`}>
                        {cell && (
                          <div>
                            <div className="font-medium text-indigo-600 leading-tight">{cell.course}</div>
                            {cell.teacher && <div className="text-stone-400 mt-0.5">{cell.teacher}</div>}
                            {cell.classroom && <div className="text-stone-400">{cell.classroom}</div>}
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
    </PageLayout>
  )
}
