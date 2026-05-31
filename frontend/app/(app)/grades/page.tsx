import { serverFetch } from '@/lib/api-server'
import { PageShell } from '@/components/PageShell'
import type { GradeEntry } from '@/lib/data'

function semesterSummary(rows: GradeEntry[]) {
  const totalCredits = rows.reduce((s, e) => s + (parseFloat(e.credits) || 0), 0)
  const passedCredits = rows.reduce((s, e) => s + (e.passed ? parseFloat(e.credits) || 0 : 0), 0)
  const scoredRows = rows.filter(e => e.score !== '' && !isNaN(parseFloat(e.score)))
  const avg = scoredRows.length > 0
    ? scoredRows.reduce((s, e) => s + parseFloat(e.score), 0) / scoredRows.length
    : null
  return { totalCredits, passedCredits, avg }
}

export default async function GradesPage() {
  let entries: GradeEntry[] = []
  try {
    const data = await serverFetch<{ entries: GradeEntry[] }>('/api/grades')
    entries = data.entries ?? []
  } catch {
    return (
      <PageShell title="成績">
        <p className="text-red-600 text-sm">載入失敗，請重新整理</p>
      </PageShell>
    )
  }

  const grouped: Record<string, GradeEntry[]> = {}
  for (const e of entries) {
    if (!grouped[e.semester]) grouped[e.semester] = []
    grouped[e.semester].push(e)
  }

  return (
    <PageShell title="成績">
      {Object.entries(grouped).map(([sem, rows]) => {
        const { totalCredits, passedCredits, avg } = semesterSummary(rows)
        return (
          <div key={sem} className="mb-8">
            <h3 className="text-xs font-medium text-stone-400 mb-2 uppercase tracking-wider">{sem}</h3>
            <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm table-fixed">
                <thead>
                  <tr className="bg-stone-50 border-b border-stone-200">
                    <th className="text-left px-4 py-2.5 font-medium text-stone-500">課程</th>
                    <th className="text-center px-4 py-2.5 font-medium text-stone-500 w-20">性質</th>
                    <th className="text-right px-4 py-2.5 font-medium text-stone-500 w-16">學分</th>
                    <th className="text-right px-4 py-2.5 font-medium text-stone-500 w-20">成績</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((e, i) => {
                    const failing = !e.passed && e.score !== ''
                    return (
                      <tr key={i} className={`border-b border-stone-100 last:border-0 ${failing ? 'bg-red-50' : ''}`}>
                        <td className={`px-4 py-2.5 truncate ${failing ? 'text-red-600' : 'text-stone-800'}`}>
                          {e.course}
                        </td>
                        <td className="px-4 py-2.5 text-center text-stone-400 text-xs">{e.type}</td>
                        <td className="px-4 py-2.5 text-right text-stone-500">{e.credits}</td>
                        <td className={`px-4 py-2.5 text-right font-medium ${failing ? 'text-red-600' : 'text-stone-800'}`}>
                          {e.score !== '' ? e.score : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t border-stone-100 bg-stone-50">
                    <td colSpan={4} className="px-4 py-2 text-xs text-stone-400">
                      修習 {totalCredits} 學分
                      {passedCredits < totalCredits && (
                        <span>・通過 <span className="text-emerald-600">{passedCredits}</span> 學分</span>
                      )}
                      {avg !== null && (
                        <span>・平均 <span className="text-stone-700 font-medium">{avg.toFixed(1)}</span></span>
                      )}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )
      })}
    </PageShell>
  )
}
