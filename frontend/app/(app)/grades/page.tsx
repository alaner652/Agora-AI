import { unstable_rethrow } from 'next/navigation'
import { serverFetch } from '@/lib/api-server'
import { PageLayout } from '@/components/PageLayout'
import { LoadError } from '@/components/LoadError'
import { GradesView } from '@/components/GradesView'
import type { GradeEntry } from '@/lib/data'

export default async function GradesPage() {
  let entries: GradeEntry[] = []
  try {
    const data = await serverFetch<{ entries: GradeEntry[] }>('/api/grades')
    entries = data.entries ?? []
  } catch (e) {
    unstable_rethrow(e)
    return (
      <PageLayout>
        <LoadError />
      </PageLayout>
    )
  }

  const allCredits = entries.reduce((s, e) => s + (parseFloat(e.credits) || 0), 0)
  const allPassed = entries.reduce((s, e) => s + (e.passed ? parseFloat(e.credits) || 0 : 0), 0)
  const allScored = entries.filter(e => e.score !== '' && !isNaN(parseFloat(e.score)))
  const allAvg = allScored.length > 0
    ? allScored.reduce((s, e) => s + parseFloat(e.score), 0) / allScored.length
    : null

  return (
    <GradesView
      entries={entries}
      allCredits={allCredits}
      allPassed={allPassed}
      allAvg={allAvg}
    />
  )
}
