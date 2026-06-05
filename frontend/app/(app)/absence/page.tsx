import { unstable_rethrow } from 'next/navigation'
import { serverFetch } from '@/lib/api-server'
import { PageLayout } from '@/components/PageLayout'
import { AbsenceView } from '@/components/AbsenceView'
import { toCEInput, inputValToRoc, thisMonthRange } from '@/lib/date'
import type { AbsenceOptions, AbsenceEntry } from '@/lib/data'

export default async function AbsencePage({
  searchParams,
}: {
  searchParams: Promise<{ semester?: string; type?: string; start?: string; end?: string }>
}) {
  const params = await searchParams

  let opts: AbsenceOptions = { semesters: [], leave_types: [] }
  let fetchError = false
  try {
    opts = await serverFetch<AbsenceOptions>('/api/absence/options')
  } catch (e) {
    unstable_rethrow(e)
    fetchError = true
  }

  const defaultSem = opts.semesters.find(s => s.selected)?.value ?? opts.semesters[0]?.value ?? ''
  const semester = params.semester ?? defaultSem
  const [defStart, defEnd] = thisMonthRange()
  const start = params.start ?? toCEInput(defStart)
  const end = params.end ?? toCEInput(defEnd)
  const type = params.type ?? '00'

  let entries: AbsenceEntry[] = []
  if (semester && !fetchError) {
    try {
      const qs = new URLSearchParams({
        semester,
        start: inputValToRoc(start),
        end: inputValToRoc(end),
        type,
      })
      const data = await serverFetch<{ entries: AbsenceEntry[] }>(`/api/absence?${qs}`)
      entries = data.entries ?? []
    } catch (e) {
      unstable_rethrow(e)
      fetchError = true
    }
  }

  if (fetchError) {
    return (
      <PageLayout>
        <p className="text-red-500 text-sm">載入失敗，請重新整理</p>
      </PageLayout>
    )
  }

  return (
    <AbsenceView
      key={`${semester}|${type}|${start}|${end}`}
      options={opts}
      entries={entries}
      semester={semester}
      leaveType={type}
      start={start}
      end={end}
    />
  )
}
