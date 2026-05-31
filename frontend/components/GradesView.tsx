'use client'

import { useState } from 'react'
import type { GradeEntry } from '@/lib/data'
import { PageLayout } from '@/components/PageLayout'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

function semesterSummary(rows: GradeEntry[]) {
  const totalCredits = rows.reduce((s, e) => s + (parseFloat(e.credits) || 0), 0)
  const passedCredits = rows.reduce((s, e) => s + (e.passed ? parseFloat(e.credits) || 0 : 0), 0)
  const scoredRows = rows.filter(e => e.score !== '' && !isNaN(parseFloat(e.score)))
  const avg = scoredRows.length > 0
    ? scoredRows.reduce((s, e) => s + parseFloat(e.score), 0) / scoredRows.length
    : null
  return { totalCredits, passedCredits, avg }
}

interface GradesViewProps {
  entries: GradeEntry[]
  allCredits: number
  allPassed: number
  allAvg: number | null
}

export function GradesView({ entries, allCredits, allPassed, allAvg }: GradesViewProps) {
  const semesters = [...new Set(entries.map(e => e.semester))]
  const [selected, setSelected] = useState(semesters[0] ?? '')

  const rows = entries.filter(e => e.semester === selected)
  const { totalCredits, passedCredits, avg } = semesterSummary(rows)

  return (
    <PageLayout>
      <PageLayout.Trend>
        <PageLayout.TrendCard title="修課學分" value={allCredits} sub="所有學期累計" />
        <PageLayout.TrendCard title="通過學分" value={allPassed} sub="所有學期累計" />
        <PageLayout.TrendCard
          title="總平均"
          value={allAvg !== null ? allAvg.toFixed(1) : '—'}
          sub="所有學期成績平均"
        />
      </PageLayout.Trend>

      <PageLayout.Toolbar>
        <div>
          <label className="block text-xs text-stone-500 mb-1">學期</label>
          <Select value={selected} onValueChange={v => v != null && setSelected(v)}>
            <SelectTrigger className="w-52">
              <SelectValue displayValue={selected} />
            </SelectTrigger>
            <SelectContent>
              {semesters.map(sem => (
                <SelectItem key={sem} value={sem}>{sem}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </PageLayout.Toolbar>

      <PageLayout.Table>
        {rows.length === 0 ? (
          <p className="text-stone-400 text-sm text-center py-8">此學期無成績資料</p>
        ) : (
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
        )}
      </PageLayout.Table>
    </PageLayout>
  )
}
