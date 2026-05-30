import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getLeaves, getLeaveForm, applyLeave, deleteLeave,
  type LeaveItem, type LeaveFormData,
} from '../api/data'
import { toCEInput, inputValToRoc, thisMonthRange } from '../utils/date'
import { DateRangePicker } from '../components/DateRangePicker'
import { useSessionGuard } from '../utils/hooks'

function StatusBadge({ label }: { label: string }) {
  let cls = 'text-gray-600 bg-gray-100'
  if (label === '已核准' || label === '核准') cls = 'text-green-700 bg-green-50'
  else if (label === '待審核' || label === '送出' || label === '待核准' || label === '待審') cls = 'text-yellow-700 bg-yellow-50'
  else if (label === '退件' || label === '不核准') cls = 'text-red-700 bg-red-50'
  else if (label === '作廢' || label === '已刪除') cls = 'text-gray-400 bg-gray-50 line-through'
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      {label || '—'}
    </span>
  )
}

// ── Leave Application Form ────────────────────────────────────────────────────

function LeaveForm({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [formDate, setFormDate] = useState('')
  const [leaveId, setLeaveId] = useState('21')
  const [reason, setReason] = useState('')
  const [periods, setPeriods] = useState<Set<string>>(new Set())
  const [confirm, setConfirm] = useState(false)
  const [submitMsg, setSubmitMsg] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState('')

  const rocDate = formDate ? inputValToRoc(formDate) : ''
  const isPublicLeave = leaveId === '23'

  const { data: formData, isLoading: formLoading } = useQuery<LeaveFormData>({
    queryKey: ['leave-form', rocDate],
    queryFn: () => getLeaveForm(rocDate),
    enabled: !!rocDate,
  })

  const leaveName = formData?.leave_types.find(t => t.id === leaveId)?.name ?? ''

  const mutation = useMutation({
    mutationFn: () => applyLeave({
      date: rocDate,
      periods: [...periods],
      leave_id: leaveId,
      leave_name: leaveName,
      reason,
    }, file ?? undefined),
    onSuccess: (data) => {
      if (data.success) {
        onSuccess()
      } else {
        setSubmitMsg(data.message || '申請失敗')
        setConfirm(false)
      }
    },
  })

  function togglePeriod(p: string) {
    setPeriods(prev => {
      const next = new Set(prev)
      next.has(p) ? next.delete(p) : next.add(p)
      return next
    })
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    if (f.size > 3 * 1024 * 1024) {
      setFileError('檔案超過 3MB 限制')
      e.target.value = ''
      return
    }
    setFileError('')
    setFile(f)
  }

  const canSubmit = !!rocDate && periods.size > 0 && !!reason.trim() && !mutation.isPending
    && (!isPublicLeave || !!file)

  return (
    <div className="bg-white rounded-xl border border-indigo-200 p-5 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-800">申請假單</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
        <div>
          <label className="block text-xs text-gray-500 mb-1">日期</label>
          <input
            type="date"
            value={formDate}
            onChange={e => { setFormDate(e.target.value); setPeriods(new Set()) }}
            className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">假別</label>
          <select
            value={leaveId}
            onChange={e => setLeaveId(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {(formData?.leave_types ?? [
              { id: '21', name: '事假' }, { id: '22', name: '病假' },
              { id: '23', name: '公假' }, { id: '24', name: '喪假' },
              { id: '25', name: '婚假' },
            ]).map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">原因</label>
          <input
            type="text"
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="請假原因"
            className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      </div>

      {rocDate && (
        <div className="mb-4">
          <label className="block text-xs text-gray-500 mb-2">節次</label>
          {formLoading ? (
            <p className="text-xs text-gray-400">載入節次中...</p>
          ) : formData?.period_order && formData.period_order.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {formData.period_order.map(p => {
                const hasClass = formData.scheduled.includes(p)
                const selected = periods.has(p)
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => togglePeriod(p)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                      selected
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : hasClass
                          ? 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'
                          : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'
                    }`}
                  >
                    {p}
                  </button>
                )
              })}
            </div>
          ) : (
            <p className="text-xs text-gray-400">無法取得節次資訊</p>
          )}
          {formData && (
            <p className="mt-1 text-xs text-gray-400">藍色為有課節次</p>
          )}
        </div>
      )}

      <div className="mb-4">
        <label className="block text-xs text-gray-500 mb-1">
          附件{isPublicLeave && <span className="text-red-500 ml-0.5">*</span>}
          <span className="text-gray-400 ml-1">（JPEG / PDF，最大 3MB）</span>
        </label>
        {file ? (
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-700 truncate max-w-xs">{file.name}</span>
            <button
              type="button"
              onClick={() => setFile(null)}
              className="text-xs text-red-400 hover:text-red-600 shrink-0"
            >
              移除
            </button>
          </div>
        ) : (
          <input
            type="file"
            accept=".jpg,.jpeg,.pdf"
            onChange={handleFileChange}
            className="text-sm text-gray-600 file:mr-3 file:py-1 file:px-3 file:rounded-lg file:border file:border-gray-300 file:text-xs file:text-gray-600 file:bg-white hover:file:bg-gray-50"
          />
        )}
        {fileError && <p className="mt-1 text-xs text-red-500">{fileError}</p>}
      </div>

      {submitMsg && (
        <p className="text-sm text-red-600 mb-3">{submitMsg}</p>
      )}

      {confirm ? (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-3">
          <p className="text-sm text-amber-800 mb-2 font-medium">確認送出申請？</p>
          <p className="text-xs text-amber-700">
            {formDate}（{rocDate}）・{leaveName}・{[...periods].join('、')}・{reason}
            {file && `・附件：${file.name}`}
          </p>
          <div className="flex gap-2 mt-3">
            <button
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending}
              className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white rounded-lg px-4 py-1.5 text-sm font-medium"
            >
              {mutation.isPending ? '送出中...' : '確認送出'}
            </button>
            <button
              onClick={() => setConfirm(false)}
              className="border border-gray-300 text-gray-600 hover:bg-gray-50 rounded-lg px-4 py-1.5 text-sm"
            >
              返回修改
            </button>
          </div>
        </div>
      ) : (
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="border border-gray-300 text-gray-600 hover:bg-gray-50 rounded-lg px-4 py-1.5 text-sm"
          >
            取消
          </button>
          <button
            onClick={() => { setSubmitMsg(''); setConfirm(true) }}
            disabled={!canSubmit}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white rounded-lg px-4 py-1.5 text-sm font-medium"
          >
            確認申請
          </button>
        </div>
      )}
    </div>
  )
}

// ── Delete Button ─────────────────────────────────────────────────────────────

function DeleteButton({ leave, onDeleted }: { leave: LeaveItem; onDeleted: () => void }) {
  const [confirm, setConfirm] = useState(false)
  const [msg, setMsg] = useState('')

  const mutation = useMutation({
    mutationFn: () => deleteLeave({
      stdkey: leave.stdkey,
      barcode: leave.barcode,
      start_date: leave.start_date,
      end_date: leave.end_date,
    }),
    onSuccess: (data) => {
      if (data.success) {
        onDeleted()
      } else {
        setMsg(data.message || '刪除失敗')
        setConfirm(false)
      }
    },
  })

  if (msg) return <span className="text-xs text-red-500">{msg}</span>

  if (confirm) {
    return (
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending}
          className="text-xs text-red-600 hover:text-red-700 font-medium disabled:opacity-50"
        >
          {mutation.isPending ? '刪除中...' : '確認'}
        </button>
        <span className="text-gray-300 text-xs">|</span>
        <button onClick={() => setConfirm(false)} className="text-xs text-gray-400 hover:text-gray-600">
          取消
        </button>
      </div>
    )
  }

  return (
    <button
      onClick={() => setConfirm(true)}
      className="text-xs text-red-400 hover:text-red-600 transition-colors shrink-0"
    >
      刪除
    </button>
  )
}

// ── Leaves Page ───────────────────────────────────────────────────────────────

export default function LeavesPage() {
  const [start, setStart] = useState(() => toCEInput(thisMonthRange()[0]))
  const [end,   setEnd  ] = useState(() => toCEInput(thisMonthRange()[1]))
  const [query, setQuery] = useState(() => ({
    start: inputValToRoc(toCEInput(thisMonthRange()[0])),
    end:   inputValToRoc(toCEInput(thisMonthRange()[1])),
  }))
  const [showForm, setShowForm] = useState(false)
  const onErr = useSessionGuard()
  const queryClient = useQueryClient()

  const { data: leaves, isLoading, error } = useQuery<LeaveItem[]>({
    queryKey: ['leaves', query],
    queryFn: () => getLeaves(query.start, query.end),
  })

  useEffect(() => { if (error) onErr(error) }, [error])

  function handleQuery() {
    setQuery({ start: inputValToRoc(start), end: inputValToRoc(end) })
  }

  function handleLeaveSuccess() {
    setShowForm(false)
    queryClient.invalidateQueries({ queryKey: ['leaves'] })
  }

  function handleDeleted() {
    queryClient.invalidateQueries({ queryKey: ['leaves'] })
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-gray-900">假單</h2>
        <button
          onClick={() => setShowForm(v => !v)}
          className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg px-4 py-1.5 text-sm font-medium transition-colors"
        >
          {showForm ? '收起' : '申請假單'}
        </button>
      </div>

      {showForm && (
        <LeaveForm
          onClose={() => setShowForm(false)}
          onSuccess={handleLeaveSuccess}
        />
      )}

      <div className="flex flex-wrap items-end gap-3 mb-6">
        <DateRangePicker
          start={start}
          end={end}
          onStartChange={setStart}
          onEndChange={setEnd}
          onQuickApply={(s, e) => setQuery({ start: inputValToRoc(s), end: inputValToRoc(e) })}
        />

        <button
          onClick={handleQuery}
          className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg px-4 py-1.5 text-sm font-medium transition-colors"
        >
          查詢
        </button>
      </div>

      {isLoading && <p className="text-gray-400 text-sm">載入中...</p>}

      {!isLoading && leaves && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {leaves.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-8">此區間無假單</p>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden md:block">
                <table className="w-full text-sm table-fixed">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="text-left px-4 py-2.5 font-medium text-gray-600">事由 / 假單號</th>
                      <th className="text-left px-4 py-2.5 font-medium text-gray-600 w-36">請假日期</th>
                      <th className="text-left px-4 py-2.5 font-medium text-gray-600 w-24">申請日</th>
                      <th className="text-center px-4 py-2.5 font-medium text-gray-600 w-24">導師</th>
                      <th className="text-center px-4 py-2.5 font-medium text-gray-600 w-24">教務</th>
                      <th className="w-20"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {leaves.map((l, i) => (
                      <tr key={i} className="border-b border-gray-100 last:border-0 align-top">
                        <td className="px-4 py-2.5">
                          <div className="font-medium text-gray-800 truncate">{l.reason || '（無事由）'}</div>
                          <div className="text-xs text-gray-400 mt-0.5 tabular-nums">#{l.barcode || l.index}</div>
                          {l.teacher_note && l.teacher_note !== '/' && (
                            <div className="text-xs text-gray-400 mt-0.5 truncate" title={l.teacher_note}>導師：{l.teacher_note}</div>
                          )}
                          {l.officer_note && l.officer_note !== '/' && (
                            <div className="text-xs text-gray-400 truncate" title={l.officer_note}>教務：{l.officer_note}</div>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-gray-600 tabular-nums text-xs">
                          {l.start_date === l.end_date ? l.start_date : `${l.start_date} — ${l.end_date}`}
                        </td>
                        <td className="px-4 py-2.5 text-gray-500 tabular-nums text-xs">{l.apply_date}</td>
                        <td className="px-4 py-2.5 text-center"><StatusBadge label={l.teacher_status} /></td>
                        <td className="px-4 py-2.5 text-center"><StatusBadge label={l.officer_status} /></td>
                        <td className="px-4 py-2.5 text-center">
                          {l.can_delete && <DeleteButton leave={l} onDeleted={handleDeleted} />}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="md:hidden divide-y divide-gray-100">
                {leaves.map((l, i) => (
                  <div key={i} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium text-gray-800 truncate">{l.reason || '（無事由）'}</p>
                        <p className="text-xs text-gray-400 tabular-nums">#{l.barcode || l.index}</p>
                      </div>
                      {l.can_delete && <DeleteButton leave={l} onDeleted={handleDeleted} />}
                    </div>
                    <p className="mt-2 text-xs text-gray-600 tabular-nums">
                      請假：{l.start_date === l.end_date ? l.start_date : `${l.start_date} — ${l.end_date}`}
                    </p>
                    <p className="text-xs text-gray-400">申請：{l.apply_date}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="text-xs text-gray-500">導師</span><StatusBadge label={l.teacher_status} />
                      <span className="text-xs text-gray-500">教務</span><StatusBadge label={l.officer_status} />
                    </div>
                    {l.teacher_note && l.teacher_note !== '/' && (
                      <p className="text-xs text-gray-400 mt-1 truncate">導師備註：{l.teacher_note}</p>
                    )}
                    {l.officer_note && l.officer_note !== '/' && (
                      <p className="text-xs text-gray-400 truncate">教務備註：{l.officer_note}</p>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
