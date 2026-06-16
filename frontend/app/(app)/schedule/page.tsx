import { unstable_rethrow } from 'next/navigation'
import { serverFetch } from '@/lib/api-server'
import { PageLayout } from '@/components/PageLayout'
import { LoadError } from '@/components/LoadError'
import { SemesterSelect } from '@/components/SemesterSelect'
import { ScheduleCalendar } from '@/components/ScheduleCalendar'
import type { SemesterOption, ScheduleEntry } from '@/lib/data'

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
  } catch (e) {
    unstable_rethrow(e)
    fetchError = true
  }

  const semester = params.semester ?? opts.find(s => s.selected)?.value ?? opts[0]?.value ?? ''

  if (semester && !fetchError) {
    try {
      const data = await serverFetch<{ entries: ScheduleEntry[] }>(`/api/schedule?semester=${encodeURIComponent(semester)}`)
      entries = data.entries ?? []
    } catch (e) {
      unstable_rethrow(e)
      fetchError = true
    }
  }

  if (fetchError) {
    return (
      <PageLayout>
        <LoadError />
      </PageLayout>
    )
  }

  const activeDays = [...new Set(entries.map(e => e.weekday))].sort()
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
          <label className="block text-xs text-muted-foreground mb-1">學期</label>
          <SemesterSelect options={opts} current={semester} />
        </div>
      </PageLayout.Toolbar>

      {!semester && (
        <p className="text-muted-foreground text-sm text-center py-8">請先選擇學期</p>
      )}
      {semester && entries.length === 0 && (
        <p className="text-muted-foreground text-sm text-center py-8">此學期無課表資料</p>
      )}
      {semester && entries.length > 0 && (
        <ScheduleCalendar entries={entries} />
      )}
    </PageLayout>
  )
}
