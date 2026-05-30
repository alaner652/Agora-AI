import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getGrades, type GradeEntry } from '../api/data'
import { useNavigate } from 'react-router-dom'
import { clearToken } from '../api/auth'

function useSessionGuard() {
  const navigate = useNavigate()
  return (err: unknown) => {
    const code = (err as { response?: { data?: { detail?: { error_code?: string } } } })
      ?.response?.data?.detail?.error_code
    if (code === 'AUTH_002' || code === 'NET_002') {
      clearToken()
      navigate('/login')
    }
  }
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
    <div className="p-6">
      <h2 className="text-xl font-semibold text-gray-900 mb-6">成績</h2>

      {isLoading && <p className="text-gray-400 text-sm">載入中...</p>}
      {error && <p className="text-red-500 text-sm">載入失敗</p>}

      {Object.entries(grouped).map(([sem, rows]) => (
        <div key={sem} className="mb-8">
          <h3 className="text-sm font-medium text-gray-500 mb-2">{sem}</h3>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600">課程</th>
                  <th className="text-right px-4 py-2.5 font-medium text-gray-600 w-16">學分</th>
                  <th className="text-right px-4 py-2.5 font-medium text-gray-600 w-16">成績</th>
                  <th className="text-right px-4 py-2.5 font-medium text-gray-600 w-16">等第</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((e, i) => {
                  const failing = e.score !== null && e.score < 60
                  return (
                    <tr
                      key={i}
                      className={`border-b border-gray-100 last:border-0 ${failing ? 'bg-red-50' : ''}`}
                    >
                      <td className={`px-4 py-2.5 ${failing ? 'text-red-700' : 'text-gray-800'}`}>
                        {e.course}
                      </td>
                      <td className="px-4 py-2.5 text-right text-gray-600">{e.credit}</td>
                      <td className={`px-4 py-2.5 text-right font-medium ${failing ? 'text-red-600' : 'text-gray-800'}`}>
                        {e.score ?? '—'}
                      </td>
                      <td className={`px-4 py-2.5 text-right ${failing ? 'text-red-500' : 'text-gray-500'}`}>
                        {e.grade ?? '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  )
}
