import { unstable_rethrow } from 'next/navigation'
import { serverFetch } from '@/lib/api-server'
import { PageLayout } from '@/components/PageLayout'
import { LoadError } from '@/components/LoadError'
import { WorkstudyView } from '@/components/WorkstudyView'
import type { SemesterOption, WorkstudyMaster } from '@/lib/data'

export default async function WorkstudyPage({
  searchParams,
}: {
  searchParams: Promise<{ semester?: string }>
}) {
  const params = await searchParams
  let opts: SemesterOption[] = []
  let master: WorkstudyMaster | null = null
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
    const [year, sms] = semester.split(',').map(s => s.trim())
    try {
      const qs = new URLSearchParams({ year, sms })
      master = await serverFetch<WorkstudyMaster>(`/api/workstudy/master?${qs}`)
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

  return <WorkstudyView key={semester} semester={semester} options={opts} master={master} />
}
