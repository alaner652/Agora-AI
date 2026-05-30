import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getGrades, type GradeEntry } from '../api/data'
import { useSessionGuard } from '../utils/hooks'
import { Spinner } from '../components/ui'
import { PageShell } from '../components/PageShell'

function semesterSummary(rows: GradeEntry[]) {
  const totalCredits = rows.reduce((s, e) => s + (parseFloat(e.credits) || 0), 0)
  const passedCredits = rows.reduce((s, e) => s + (e.passed ? parseFloat(e.credits) || 0 : 0), 0)
  const scoredRows = rows.filter(e => e.score !== '' && !isNaN(parseFloat(e.score)))
  const avg = scoredRows.length > 0
    ? scoredRows.reduce((s, e) => s + parseFloat(e.score), 0) / scoredRows.length
    : null
  return { totalCredits, passedCredits, avg }
}

export default function GradesPage() {
  const onErr = useSessionGuard()
  const { data: entries, isLoading, error } = useQuery<GradeEntry[]>({
    queryKey: ['grades'],
    queryFn: getGrades,
  })

  useEffect(() => { if (error) onErr(error) }, [error])

  const grouped: Record<string, GradeEntry[]> = {}
  for (const e of entries ?? []) {
    if (!grouped[e.semester]) grouped[e.semester] = []
    grouped[e.semester].push(e)
  }

  return (
    <PageShell title="成績">
      {isLoading && (
        <div className="flex items-center gap-2 text-zinc-500 text-sm">
          <Spinner className="w-4 h-4" />載入中...
        </div>
      )}
      {error && <p className="text-red-400 text-sm">載入失敗</p>}

      {Object.entries(grouped).map(([sem, rows]) => {
        const { totalCredits, passedCredits, avg } = semesterSummary(rows)
        return (
          <div key={sem} className="mb-8">
            <h3 className="text-xs font-medium text-zinc-500 mb-2 uppercase tracking-wider">{sem}</h3>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
              <table className="w-full text-sm table-fixed">
                <thead>
                  <tr className="bg-zinc-800/60 border-b border-zinc-800">
                    <th className="text-left px-4 py-2.5 font-medium text-zinc-400">課程</th>
                    <th className="text-center px-4 py-2.5 font-medium text-zinc-400 w-20">性質</th>
                    <th className="text-right px-4 py-2.5 font-medium text-zinc-400 w-16">學分</th>
                    <th className="text-right px-4 py-2.5 font-medium text-zinc-400 w-20">成績</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((e, i) => {
                    const failing = !e.passed && e.score !== ''
                    return (
                      <tr key={i} className={`border-b border-zinc-800 last:border-0 ${failing ? 'bg-red-500/5' : ''}`}>
                        <td className={`px-4 py-2.5 truncate ${failing ? 'text-red-400' : 'text-zinc-200'}`}>
                          {e.course}
                        </td>
                        <td className="px-4 py-2.5 text-center text-zinc-500 text-xs">{e.type}</td>
                        <td className="px-4 py-2.5 text-right text-zinc-400">{e.credits}</td>
                        <td className={`px-4 py-2.5 text-right font-medium ${failing ? 'text-red-400' : 'text-zinc-200'}`}>
                          {e.score !== '' ? e.score : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t border-zinc-800 bg-zinc-800/40">
                    <td colSpan={4} className="px-4 py-2 text-xs text-zinc-500">
                      修習 {totalCredits} 學分
                      {passedCredits < totalCredits && (
                        <span>・通過 <span className="text-emerald-400">{passedCredits}</span> 學分</span>
                      )}
                      {avg !== null && (
                        <span>・平均 <span className="text-zinc-300 font-medium">{avg.toFixed(1)}</span></span>
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
