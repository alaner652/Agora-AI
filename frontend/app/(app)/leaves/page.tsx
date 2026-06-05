import { unstable_rethrow } from 'next/navigation'
import { serverFetch } from '@/lib/api-server'
import { PageLayout } from '@/components/PageLayout'
import { LeavesView } from '@/components/LeavesView'
import { toCEInput, inputValToRoc, thisMonthRange } from '@/lib/date'
import type { LeaveItem } from '@/lib/data'

export default async function LeavesPage({
  searchParams,
}: {
  searchParams: Promise<{ start?: string; end?: string }>
}) {
  const params = await searchParams
  const [defStart, defEnd] = thisMonthRange()
  const start = params.start ?? toCEInput(defStart)
  const end = params.end ?? toCEInput(defEnd)

  let leaves: LeaveItem[] = []
  try {
    const qs = new URLSearchParams({ start: inputValToRoc(start), end: inputValToRoc(end) })
    const data = await serverFetch<{ leaves: LeaveItem[] }>(`/api/leaves?${qs}`)
    leaves = data.leaves ?? []
  } catch (e) {
    unstable_rethrow(e)
    return (
      <PageLayout>
        <p className="text-red-500 text-sm">載入失敗，請重新整理</p>
      </PageLayout>
    )
  }

  return (
    <LeavesView
      key={`${start}|${end}`}
      leaves={leaves}
      start={start}
      end={end}
    />
  )
}
