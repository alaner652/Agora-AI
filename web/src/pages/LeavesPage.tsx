import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getLeaves, getLeaveForm, applyLeave, deleteLeave,
  type LeaveItem, type LeaveFormData,
} from '../api/data'
import { toCEInput, inputValToRoc, thisMonthRange } from '../utils/date'
import { DateRangePicker } from '../components/DateRangePicker'
import { useSessionGuard } from '../utils/hooks'
import { Button, Input, Select, StatusBadge, Spinner } from '../components/ui'
import { PageShell } from '../components/PageShell'

// ── Helpers ───────────────────────────────────────────────────────────────────

function getWorkdays(startStr: string, endStr: string): Date[] {
  const days: Date[] = []
  const cur = new Date(startStr)
  const end = new Date(endStr)
  while (cur <= end) {
    const dow = cur.getDay()
    if (dow !== 0 && dow !== 6) days.push(new Date(cur))
    cur.setDate(cur.getDate() + 1)
  }
  return days
}

function toCEInputFromDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

const dateCls = 'bg-white border border-stone-300 text-stone-900 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400/50 w-full sm:w-auto'
const quickDateCls = 'text-xs text-orange-500 hover:text-orange-600 hover:underline transition-colors'

// ── Leave Notice ──────────────────────────────────────────────────────────────

const NOTICE_KEY = 'leave_notice_ack'

const NOTICE_ITEMS = [
  {
    label: '一、事前登錄',
    text: '請事假或公假等可預期之請假，須於事前上網登錄，並證明事先完成請假手續，事後概不准假。',
  },
  {
    label: '二、事後補登',
    text: '病假或突發事故，無法事先辦理請假者，返校上課 5 日內上網登錄，並證明完成請假手續。',
  },
  {
    label: '三、准假程序',
    steps: [
      '請假 2 日內：導師（網路線上處理）',
      '請假 3 日內：導師＋輔導教官（網路線上處理）',
      '請假 4–5 日內：導師＋輔導教官＋生輔組長（列印紙本併佐證呈核）',
      '請假 6–7 日內：導師＋輔導教官＋學務長（列印紙本併佐證呈核）',
      '請假 8 日以上：導師＋輔導教官＋生輔組長＋學務長＋校長（列印紙本併佐證呈核）',
    ],
  },
  {
    label: '四、逾期 / 特案',
    text: '逾期或特案請假，統以專簽與紙本假單辦理，准假權責：5 日內由生輔組長准假，6 日以上依學務長、校長權限辦理。',
  },
  {
    label: '五、紙本假單',
    text: '紙本假單統一投遞地點為教學區 2 樓生輔組，投遞後請妥善保存根聯，以備日後查核。',
  },
  {
    label: '六、考試期間',
    text: '期中考及期末考之請假，須經課務組核准，方能由授課老師給予補考成績。',
  },
  {
    label: '七、登錄確認',
    text: '請假經核准後送生活輔導組登錄，未經登錄視同曠課。',
  },
  {
    label: '八、考試請假',
    text: '於考試期間請假者，一律列印紙本，按照流程逐一簽核後送生輔組核准。',
  },
]

function LeaveNotice({ onAck }: { onAck: () => void }) {
  return (
    <div className="bg-white border border-stone-200 rounded-xl p-5 mb-6">
      <div className="mb-5">
        <h3 className="text-base font-semibold text-stone-900 mb-1">學生請假注意事項</h3>
        <p className="text-xs text-stone-400">請閱讀以下事項後，再進行請假申請。</p>
      </div>

      <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
        {NOTICE_ITEMS.map((item, i) => (
          <div key={i} className="flex gap-3">
            <span className="text-orange-500 text-xs font-medium shrink-0 mt-0.5 w-24">{item.label}</span>
            <div className="text-xs text-stone-600 leading-relaxed">
              {item.steps ? (
                <ol className="space-y-1">
                  {item.steps.map((s, j) => (
                    <li key={j} className="flex gap-1.5">
                      <span className="text-stone-400 shrink-0">{j + 1}.</span>
                      <span>{s}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p>{item.text}</p>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5 pt-4 border-t border-stone-200 flex items-center justify-between">
        <p className="text-xs text-orange-500 font-medium">請假經核准後送生活輔導組登錄，未經登錄視同曠課。</p>
        <Button onClick={onAck} size="sm">我已閱讀，開始申請</Button>
      </div>
    </div>
  )
}

// ── Leave Application Form ────────────────────────────────────────────────────

interface BatchProgress { current: number; total: number; day: string }

function LeaveForm({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const today = toCEInputFromDate(new Date())
  const [formStart, setFormStart] = useState(today)
  const [formEnd,   setFormEnd  ] = useState(today)
  const [leaveId, setLeaveId] = useState('21')
  const [reason, setReason] = useState('')
  const [periods, setPeriods] = useState<Set<string>>(new Set())
  const [confirm, setConfirm] = useState(false)
  const [submitMsg, setSubmitMsg] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState('')
  const [progress, setProgress] = useState<BatchProgress | null>(null)
  const [done, setDone] = useState(false)

  const rocStartDate = formStart ? inputValToRoc(formStart) : ''
  const isPublicLeave = leaveId === '23'
  const workdays = formStart && formEnd ? getWorkdays(formStart, formEnd) : []

  const { data: formData, isLoading: formLoading } = useQuery<LeaveFormData>({
    queryKey: ['leave-form', rocStartDate],
    queryFn: () => getLeaveForm(rocStartDate),
    enabled: !!rocStartDate,
  })

  useEffect(() => { setPeriods(new Set()) }, [formStart])

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

  function setQuickDate(offset: number) {
    const d = new Date()
    d.setDate(d.getDate() + offset)
    const s = toCEInputFromDate(d)
    setFormStart(s)
    setFormEnd(s)
  }

  function setThisWeek() {
    const d = new Date()
    const dow = d.getDay()
    const friday = new Date(d)
    friday.setDate(d.getDate() + (5 - (dow === 0 ? 7 : dow)))
    setFormStart(toCEInputFromDate(d))
    setFormEnd(toCEInputFromDate(friday))
  }

  const canSubmit = !!rocStartDate && workdays.length > 0 && periods.size > 0 && !!reason.trim()
    && (!isPublicLeave || !!file)
  const isMultiDay = workdays.length > 1

  async function handleBatchSubmit() {
    setProgress(null)
    setSubmitMsg('')
    const days = workdays.map(d => toCEInputFromDate(d))
    for (let i = 0; i < days.length; i++) {
      const day = days[i]
      const rocDay = inputValToRoc(day)
      setProgress({ current: i + 1, total: days.length, day })
      try {
        const result = await applyLeave(
          { date: rocDay, periods: [...periods], leave_id: leaveId, reason },
          i === 0 ? file ?? undefined : undefined,
        )
        if (!result.success) {
          setSubmitMsg(`第 ${i + 1} 天（${day}）申請失敗：${result.message || '未知錯誤'}`)
          setConfirm(false)
          setProgress(null)
          return
        }
      } catch {
        setSubmitMsg(`第 ${i + 1} 天（${day}）發生錯誤，請稍後再試`)
        setConfirm(false)
        setProgress(null)
        return
      }
    }
    setProgress(null)
    setDone(true)
    setTimeout(() => onSuccess(), 1000)
  }

  if (done) {
    return (
      <div className="bg-white border border-stone-200 rounded-xl p-5 mb-6 text-center">
        <p className="text-emerald-600 font-medium">✓ {workdays.length > 1 ? `${workdays.length} 天` : ''}假單申請成功！</p>
      </div>
    )
  }

  return (
    <div className="bg-white border border-stone-200 rounded-xl p-5 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-stone-900">申請假單</h3>
        <button onClick={onClose} className="text-stone-400 hover:text-stone-600 text-lg leading-none transition-colors">✕</button>
      </div>

      {/* Date range */}
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-1.5">
          <label className="text-xs text-stone-500">請假日期</label>
          <button type="button" onClick={() => setQuickDate(0)} className={quickDateCls}>今天</button>
          <span className="text-stone-300 text-xs">|</span>
          <button type="button" onClick={() => setQuickDate(1)} className={quickDateCls}>明天</button>
          <span className="text-stone-300 text-xs">|</span>
          <button type="button" onClick={setThisWeek} className={quickDateCls}>本週</button>
        </div>
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
          <input type="date" value={formStart}
            onChange={e => { setFormStart(e.target.value); setPeriods(new Set()) }}
            className={dateCls}
          />
          <span className="hidden sm:block text-stone-300 text-sm">—</span>
          <input type="date" value={formEnd}
            min={formStart}
            onChange={e => setFormEnd(e.target.value)}
            className={dateCls}
          />
        </div>
        {workdays.length > 0 && (
          <p className="mt-1.5 text-xs text-stone-500">
            共 <span className="text-orange-500 font-medium">{workdays.length}</span> 個工作日
            {workdays.length > 1 && <span className="text-stone-400 ml-1">（已排除週六日）</span>}
          </p>
        )}
        {formStart && formEnd && workdays.length === 0 && (
          <p className="mt-1.5 text-xs text-amber-600">所選日期範圍無工作日（週末）</p>
        )}
      </div>

      {/* Leave type + reason */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <div>
          <label className="block text-xs text-stone-500 mb-1">假別</label>
          {!rocStartDate ? (
            <Select disabled className="w-full">
              <option>請先選擇日期</option>
            </Select>
          ) : formLoading ? (
            <div className="flex items-center gap-2 h-9">
              <Spinner className="w-4 h-4" />
              <span className="text-xs text-stone-500">載入中...</span>
            </div>
          ) : (
            <Select value={leaveId} onChange={e => setLeaveId(e.target.value)} className="w-full">
              {(formData?.leave_types ?? []).map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </Select>
          )}
        </div>

        <div>
          <label className="block text-xs text-stone-500 mb-1">原因</label>
          <Input type="text" value={reason} onChange={e => setReason(e.target.value)}
            placeholder="請假原因" />
        </div>
      </div>

      {/* Period selector */}
      {rocStartDate && (
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-2">
            <label className="text-xs text-stone-500">節次</label>
            {isMultiDay && <span className="text-xs text-stone-400">（以起始日課表為準，統一套用所有天）</span>}
          </div>
          {formLoading ? (
            <p className="text-xs text-stone-400">載入節次中...</p>
          ) : formData?.period_order && formData.period_order.length > 0 ? (
            <>
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
                          ? 'bg-orange-500 text-white border-orange-500'
                          : hasClass
                            ? 'bg-orange-50 text-orange-600 border-orange-200 hover:bg-orange-100'
                            : 'bg-white text-stone-500 border-stone-300 hover:bg-stone-50'
                      }`}
                    >
                      {p}
                    </button>
                  )
                })}
              </div>
              <p className="mt-1.5 text-xs text-stone-400">橘色為有課節次</p>
            </>
          ) : (
            <p className="text-xs text-stone-400">無法取得節次資訊</p>
          )}
        </div>
      )}

      {/* Attachment */}
      <div className="mb-4">
        <label className="block text-xs text-stone-500 mb-1">
          附件{isPublicLeave && <span className="text-red-500 ml-0.5">*</span>}
          <span className="text-stone-400 ml-1">（JPEG / PDF，最大 3MB）</span>
        </label>
        {file ? (
          <div className="flex items-center gap-2">
            <span className="text-sm text-stone-700 truncate max-w-xs">{file.name}</span>
            <button type="button" onClick={() => setFile(null)} className="text-xs text-red-500 hover:text-red-600 shrink-0 transition-colors">移除</button>
          </div>
        ) : (
          <input type="file" accept=".jpg,.jpeg,.pdf" onChange={handleFileChange}
            className="text-sm text-stone-500 file:mr-3 file:py-1 file:px-3 file:rounded-lg file:border file:border-stone-300 file:text-xs file:text-stone-700 file:bg-stone-100 hover:file:bg-stone-200 transition-colors" />
        )}
        {fileError && <p className="mt-1 text-xs text-red-600">{fileError}</p>}
      </div>

      {submitMsg && <p className="text-sm text-red-600 mb-3">{submitMsg}</p>}

      {/* Progress */}
      {progress && (
        <div className="bg-stone-100 border border-stone-200 rounded-lg px-4 py-3 mb-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-stone-600">送出中 {progress.current} / {progress.total}</span>
            <Spinner className="w-4 h-4" />
          </div>
          <div className="w-full bg-stone-200 rounded-full h-1.5">
            <div
              className="bg-orange-500 h-1.5 rounded-full transition-all"
              style={{ width: `${(progress.current / progress.total) * 100}%` }}
            />
          </div>
          <p className="text-xs text-stone-500 mt-1.5">{progress.day}</p>
        </div>
      )}

      {/* Confirmation */}
      {confirm && !progress ? (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-3">
          <p className="text-sm text-amber-700 mb-2 font-medium">確認送出申請？</p>
          <div className="text-xs text-amber-700 space-y-1">
            <p>日期：{isMultiDay ? `${formStart} ～ ${formEnd}（共 ${workdays.length} 天）` : formStart}</p>
            <p>假別：{formData?.leave_types.find(t => t.id === leaveId)?.name ?? leaveId}</p>
            <p>節次：{[...periods].join('、')}</p>
            <p>原因：{reason}</p>
            {file && <p>附件：{file.name}</p>}
          </div>
          {isMultiDay && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {workdays.map(d => {
                const s = toCEInputFromDate(d)
                return (
                  <span key={s} className="text-[10px] bg-stone-100 text-stone-500 rounded px-1.5 py-0.5">
                    {s}（{inputValToRoc(s)}）
                  </span>
                )
              })}
            </div>
          )}
          <div className="flex gap-2 mt-3">
            <Button onClick={handleBatchSubmit} disabled={!!progress} size="sm">確認送出</Button>
            <Button variant="secondary" onClick={() => setConfirm(false)} size="sm">返回修改</Button>
          </div>
        </div>
      ) : !progress && (
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} size="sm">取消</Button>
          <Button
            onClick={() => { setSubmitMsg(''); setConfirm(true) }}
            disabled={!canSubmit || workdays.length === 0 || periods.size === 0 || !reason.trim()}
            size="sm"
          >
            確認申請
          </Button>
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

  if (msg) return <span className="text-xs text-red-600">{msg}</span>

  if (confirm) {
    return (
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending}
          className="text-xs text-red-600 hover:text-red-700 font-medium disabled:opacity-50 transition-colors"
        >
          {mutation.isPending ? '刪除中...' : '確認'}
        </button>
        <span className="text-stone-300 text-xs">|</span>
        <button onClick={() => setConfirm(false)} className="text-xs text-stone-500 hover:text-stone-700 transition-colors">取消</button>
      </div>
    )
  }

  return (
    <button
      onClick={() => setConfirm(true)}
      className="text-xs text-stone-400 hover:text-red-500 transition-colors shrink-0"
    >
      刪除
    </button>
  )
}

// ── Leaves Page ───────────────────────────────────────────────────────────────

type PageView = 'notice' | 'form'

export default function LeavesPage() {
  const [start, setStart] = useState(() => toCEInput(thisMonthRange()[0]))
  const [end,   setEnd  ] = useState(() => toCEInput(thisMonthRange()[1]))
  const [query, setQuery] = useState(() => ({
    start: inputValToRoc(toCEInput(thisMonthRange()[0])),
    end:   inputValToRoc(toCEInput(thisMonthRange()[1])),
  }))
  const [view, setView] = useState<PageView | null>(null)
  const onErr = useSessionGuard()
  const queryClient = useQueryClient()

  const { data: leaves, isLoading, error } = useQuery<LeaveItem[]>({
    queryKey: ['leaves', query],
    queryFn: () => getLeaves(query.start, query.end),
  })

  useEffect(() => { if (error) onErr(error) }, [error])

  function handleApplyClick() {
    const acked = sessionStorage.getItem(NOTICE_KEY)
    setView(acked ? 'form' : 'notice')
  }

  function handleNoticeAck() {
    sessionStorage.setItem(NOTICE_KEY, '1')
    setView('form')
  }

  function handleQuery() {
    setQuery({ start: inputValToRoc(start), end: inputValToRoc(end) })
  }

  function handleLeaveSuccess() {
    setView(null)
    queryClient.invalidateQueries({ queryKey: ['leaves'] })
  }

  function handleDeleted() {
    queryClient.invalidateQueries({ queryKey: ['leaves'] })
  }

  const applyBtn = view === null
    ? <Button onClick={handleApplyClick} size="sm">申請假單</Button>
    : <Button variant="ghost" onClick={() => setView(null)} size="sm">收起</Button>

  return (
    <PageShell title="假單" action={applyBtn}>
      {view === 'notice' && <LeaveNotice onAck={handleNoticeAck} />}
      {view === 'form' && (
        <LeaveForm
          onClose={() => setView(null)}
          onSuccess={handleLeaveSuccess}
        />
      )}

      {/* History filters */}
      <div className="flex flex-wrap items-end gap-3 mb-6">
        <DateRangePicker
          start={start}
          end={end}
          onStartChange={setStart}
          onEndChange={setEnd}
          onQuickApply={(s, e) => setQuery({ start: inputValToRoc(s), end: inputValToRoc(e) })}
        />
        <Button variant="secondary" onClick={handleQuery} size="sm">查詢</Button>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 text-stone-500 text-sm">
          <Spinner className="w-4 h-4" />載入中...
        </div>
      )}

      {!isLoading && leaves && (
        <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
          {leaves.length === 0 ? (
            <p className="text-stone-400 text-sm text-center py-8">此區間無假單</p>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden md:block">
                <table className="w-full text-sm table-fixed">
                  <thead>
                    <tr className="bg-stone-50 border-b border-stone-200">
                      <th className="text-left px-4 py-2.5 font-medium text-stone-500">事由 / 假單號</th>
                      <th className="text-left px-4 py-2.5 font-medium text-stone-500 w-36">請假日期</th>
                      <th className="text-left px-4 py-2.5 font-medium text-stone-500 w-24">申請日</th>
                      <th className="text-center px-4 py-2.5 font-medium text-stone-500 w-24">導師</th>
                      <th className="text-center px-4 py-2.5 font-medium text-stone-500 w-24">教務</th>
                      <th className="w-16"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {leaves.map((l, i) => (
                      <tr key={i} className="border-b border-stone-100 last:border-0 align-top hover:bg-stone-50 transition-colors">
                        <td className="px-4 py-2.5">
                          <div className="font-medium text-stone-800 truncate">{l.reason || '（無事由）'}</div>
                          <div className="text-xs text-stone-400 mt-0.5 tabular-nums">#{l.barcode || l.index}</div>
                          {l.teacher_note && l.teacher_note !== '/' && (
                            <div className="text-xs text-stone-400 mt-0.5 truncate" title={l.teacher_note}>導師：{l.teacher_note}</div>
                          )}
                          {l.officer_note && l.officer_note !== '/' && (
                            <div className="text-xs text-stone-400 truncate" title={l.officer_note}>教務：{l.officer_note}</div>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-stone-500 tabular-nums text-xs">
                          {l.start_date === l.end_date ? l.start_date : `${l.start_date} — ${l.end_date}`}
                        </td>
                        <td className="px-4 py-2.5 text-stone-400 tabular-nums text-xs">{l.apply_date}</td>
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
              <div className="md:hidden divide-y divide-stone-100">
                {leaves.map((l, i) => (
                  <div key={i} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium text-stone-800 truncate">{l.reason || '（無事由）'}</p>
                        <p className="text-xs text-stone-400 tabular-nums">#{l.barcode || l.index}</p>
                      </div>
                      {l.can_delete && <DeleteButton leave={l} onDeleted={handleDeleted} />}
                    </div>
                    <p className="mt-2 text-xs text-stone-500 tabular-nums">
                      請假：{l.start_date === l.end_date ? l.start_date : `${l.start_date} — ${l.end_date}`}
                    </p>
                    <p className="text-xs text-stone-400">申請：{l.apply_date}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="text-xs text-stone-400">導師</span><StatusBadge label={l.teacher_status} />
                      <span className="text-xs text-stone-400">教務</span><StatusBadge label={l.officer_status} />
                    </div>
                    {l.teacher_note && l.teacher_note !== '/' && (
                      <p className="text-xs text-stone-400 mt-1 truncate">導師備註：{l.teacher_note}</p>
                    )}
                    {l.officer_note && l.officer_note !== '/' && (
                      <p className="text-xs text-stone-400 truncate">教務備註：{l.officer_note}</p>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </PageShell>
  )
}
