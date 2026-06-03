'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus, X, Trash2 } from 'lucide-react'
import {
  getLeaves, getLeaveForm, applyLeave, deleteLeave,
  type LeaveItem, type LeaveFormData,
} from '@/lib/data'
import { toCEInput, inputValToRoc, thisMonthRange } from '@/lib/date'
import { DateRangePicker } from '@/components/DateRangePicker'
import { PageLayout } from '@/components/PageLayout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  PUBLIC_LEAVE_ID,
  LEAVE_NOTICE_ACK_KEY,
  LEAVE_NOTICE_ITEMS,
  leaveStatusCls,
} from '@/lib/constants'

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

function toCEInputFromDate(d: Date) { return d.toISOString().slice(0, 10) }

const dateCls = 'bg-card border border-border text-foreground rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 w-full'

function StatusBadge({ label }: { label: string }) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${leaveStatusCls(label)}`}>
      {label || '—'}
    </span>
  )
}

// ── Leave Notice ──────────────────────────────────────────────────────────────

function LeaveNotice({ onAck }: { onAck: () => void }) {
  return (
    <>
      <DialogHeader>
        <DialogTitle>學生請假注意事項</DialogTitle>
        <p className="text-xs text-muted-foreground/70">請閱讀以下事項後，再進行請假申請。</p>
      </DialogHeader>
      <div className="space-y-3 max-h-80 overflow-y-auto pr-1 -mx-1 px-1">
        {LEAVE_NOTICE_ITEMS.map((item, i) => (
          <div key={i} className="flex gap-3">
            <span className="text-primary text-xs font-medium shrink-0 mt-0.5 w-24">{item.label}</span>
            <div className="text-xs text-muted-foreground leading-relaxed">
              {item.steps ? (
                <ol className="space-y-1">
                  {item.steps.map((s, j) => (
                    <li key={j} className="flex gap-1.5">
                      <span className="text-muted-foreground/70 shrink-0">{j + 1}.</span>
                      <span>{s}</span>
                    </li>
                  ))}
                </ol>
              ) : <p>{item.text}</p>}
            </div>
          </div>
        ))}
      </div>
      <div className="pt-3 border-t border-border/60 flex items-center justify-between gap-3">
        <p className="text-xs text-primary font-medium flex-1">請假經核准後送生活輔導組登錄，未經登錄視同曠課。</p>
        <Button onClick={onAck} className="bg-primary hover:bg-primary/90 text-white shrink-0">
          我已閱讀，開始申請
        </Button>
      </div>
    </>
  )
}

// ── Leave Form ────────────────────────────────────────────────────────────────

interface BatchProgress { current: number; total: number; day: string }

function LeaveForm({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const today = toCEInputFromDate(new Date())
  const [formStart, setFormStart] = useState(today)
  const [formEnd, setFormEnd] = useState(today)
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
  const isPublicLeave = leaveId === PUBLIC_LEAVE_ID
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
    if (f.size > 3 * 1024 * 1024) { setFileError('檔案超過 3MB 限制'); e.target.value = ''; return }
    setFileError('')
    setFile(f)
  }

  function setQuickDate(offset: number) {
    const d = new Date(); d.setDate(d.getDate() + offset)
    const s = toCEInputFromDate(d)
    setFormStart(s); setFormEnd(s)
  }

  function setThisWeek() {
    const d = new Date(); const dow = d.getDay()
    const friday = new Date(d)
    friday.setDate(d.getDate() + (5 - (dow === 0 ? 7 : dow)))
    setFormStart(toCEInputFromDate(d)); setFormEnd(toCEInputFromDate(friday))
  }

  const canSubmit = !!rocStartDate && workdays.length > 0 && periods.size > 0 && !!reason.trim()
    && (!isPublicLeave || !!file)
  const isMultiDay = workdays.length > 1

  async function handleBatchSubmit() {
    setProgress(null); setSubmitMsg('')
    const days = workdays.map(d => toCEInputFromDate(d))
    for (let i = 0; i < days.length; i++) {
      setProgress({ current: i + 1, total: days.length, day: days[i] })
      try {
        const result = await applyLeave(
          { date: inputValToRoc(days[i]), periods: [...periods], leave_id: leaveId, reason },
          i === 0 ? file ?? undefined : undefined,
        )
        if (!result.success) {
          setSubmitMsg(`第 ${i + 1} 天（${days[i]}）申請失敗：${result.message || '未知錯誤'}`)
          setConfirm(false); setProgress(null); return
        }
      } catch {
        setSubmitMsg(`第 ${i + 1} 天（${days[i]}）發生錯誤，請稍後再試`)
        setConfirm(false); setProgress(null); return
      }
    }
    setProgress(null); setDone(true)
    toast.success(workdays.length > 1 ? `假單申請成功（共 ${workdays.length} 天）` : '假單申請成功')
    setTimeout(() => onSuccess(), 1000)
  }

  if (done) {
    return (
      <div className="py-8 text-center">
        <p className="text-emerald-600 font-medium text-lg">✓ 假單申請成功！</p>
        {workdays.length > 1 && <p className="text-muted-foreground/70 text-sm mt-1">共 {workdays.length} 天</p>}
      </div>
    )
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>申請假單</DialogTitle>
      </DialogHeader>

      {/* 請假日期 */}
      <div>
        <div className="flex items-center gap-2 mb-1.5">
          <label className="text-xs font-medium text-muted-foreground">請假日期</label>
          <span className="text-muted-foreground/30 text-xs">|</span>
          {[['今天', 0], ['明天', 1]].map(([label, offset]) => (
            <button key={label} type="button"
              onClick={() => setQuickDate(offset as number)}
              className="text-xs text-primary hover:text-primary hover:underline transition-colors">
              {label}
            </button>
          ))}
          <button type="button" onClick={setThisWeek}
            className="text-xs text-primary hover:text-primary hover:underline transition-colors">
            本週
          </button>
        </div>
        <div className="flex items-center gap-2">
          <input type="date" value={formStart}
            onChange={e => { setFormStart(e.target.value); setPeriods(new Set()) }}
            className={dateCls} />
          <span className="text-muted-foreground/50 text-sm shrink-0">—</span>
          <input type="date" value={formEnd} min={formStart}
            onChange={e => setFormEnd(e.target.value)} className={dateCls} />
        </div>
        {workdays.length > 0 && (
          <p className="mt-1 text-xs text-muted-foreground/70">
            共 <span className="text-primary font-medium">{workdays.length}</span> 個工作日
            {workdays.length > 1 && '（已排除週六日）'}
          </p>
        )}
        {formStart && formEnd && workdays.length === 0 && (
          <p className="mt-1 text-xs text-amber-600">所選日期範圍無工作日</p>
        )}
      </div>

      {/* 假別 + 原因 */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">假別</label>
          {!rocStartDate ? (
            <Select disabled>
              <SelectTrigger className="w-full"><SelectValue placeholder="請先選擇日期" /></SelectTrigger>
              <SelectContent />
            </Select>
          ) : formLoading ? (
            <div className="flex items-center gap-2 h-8 text-xs text-muted-foreground/70">
              <Spinner className="w-3.5 h-3.5" />
              載入中...
            </div>
          ) : (
            <Select value={leaveId} onValueChange={v => v != null && setLeaveId(v)}>
              <SelectTrigger className="w-full">
                <SelectValue displayValue={formData?.leave_types.find(t => t.id === leaveId)?.name} />
              </SelectTrigger>
              <SelectContent>
                {(formData?.leave_types ?? []).map(t => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">原因</label>
          <Input value={reason} onChange={e => setReason(e.target.value)} placeholder="請假原因" />
        </div>
      </div>

      {/* 節次 */}
      {rocStartDate && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <label className="text-xs font-medium text-muted-foreground">節次</label>
            {isMultiDay && <span className="text-xs text-muted-foreground/70">（以起始日為準）</span>}
          </div>
          {formLoading ? (
            <p className="text-xs text-muted-foreground/70">載入節次中...</p>
          ) : formData?.period_order && formData.period_order.length > 0 ? (
            <>
              <div className="flex flex-wrap gap-1.5">
                {formData.period_order.map(p => {
                  const hasClass = formData.scheduled.includes(p)
                  const selected = periods.has(p)
                  return (
                    <button key={p} type="button" onClick={() => togglePeriod(p)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                        selected
                          ? 'bg-primary text-white border-primary'
                          : hasClass
                            ? 'bg-accent text-primary border-primary/40 hover:bg-accent'
                            : 'bg-card text-muted-foreground border-border hover:bg-accent/50'
                      }`}
                    >{p}</button>
                  )
                })}
              </div>
              <p className="mt-1 text-xs text-muted-foreground/70">藍色為有課節次</p>
            </>
          ) : (
            <p className="text-xs text-muted-foreground/70">無法取得節次資訊</p>
          )}
        </div>
      )}

      {/* 附件 */}
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1">
          附件{isPublicLeave && <span className="text-red-500 ml-0.5">*</span>}
          <span className="text-muted-foreground/70 ml-1 font-normal">（JPEG / PDF，最大 3MB）</span>
        </label>
        {file ? (
          <div className="flex items-center gap-2">
            <span className="text-sm text-foreground/80 truncate">{file.name}</span>
            <button type="button" onClick={() => setFile(null)}
              className="text-muted-foreground/70 hover:text-red-500 transition-colors shrink-0">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <input type="file" accept=".jpg,.jpeg,.pdf" onChange={handleFileChange}
            className="text-sm text-muted-foreground file:mr-3 file:py-1 file:px-3 file:rounded-lg file:border file:border-border file:text-xs file:text-foreground/80 file:bg-muted/30 hover:file:bg-muted transition-colors" />
        )}
        {fileError && <p className="mt-1 text-xs text-red-600">{fileError}</p>}
      </div>

      {submitMsg && <p className="text-sm text-red-600">{submitMsg}</p>}

      {/* Progress */}
      {progress && (
        <div className="bg-muted/30 border border-border rounded-lg px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-muted-foreground">送出中 {progress.current} / {progress.total}</span>
            <Spinner />
          </div>
          <div className="w-full bg-muted rounded-full h-1.5">
            <div className="bg-primary h-1.5 rounded-full transition-all"
              style={{ width: `${(progress.current / progress.total) * 100}%` }} />
          </div>
          <p className="text-xs text-muted-foreground/70 mt-1.5">{progress.day}</p>
        </div>
      )}

      {/* Confirm / Actions */}
      {confirm && !progress ? (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
          <p className="text-sm text-amber-700 mb-2 font-medium">確認送出申請？</p>
          <div className="text-xs text-amber-700 space-y-1">
            <p>日期：{isMultiDay ? `${formStart} ～ ${formEnd}（共 ${workdays.length} 天）` : formStart}</p>
            <p>假別：{formData?.leave_types.find(t => t.id === leaveId)?.name ?? '未知假別'}</p>
            <p>節次：{[...periods].join('、')}</p>
            <p>原因：{reason}</p>
            {file && <p>附件：{file.name}</p>}
          </div>
          {isMultiDay && (
            <div className="mt-2 flex flex-wrap gap-1">
              {workdays.map(d => {
                const s = toCEInputFromDate(d)
                return (
                  <span key={s} className="text-[10px] bg-card text-muted-foreground border border-border rounded px-1.5 py-0.5">
                    {s}
                  </span>
                )
              })}
            </div>
          )}
          <div className="flex gap-2 mt-3">
            <Button onClick={handleBatchSubmit} disabled={!!progress}
              className="bg-primary hover:bg-primary/90 text-white h-8 text-xs">
              確認送出
            </Button>
            <Button variant="outline" onClick={() => setConfirm(false)} className="h-8 text-xs">
              返回修改
            </Button>
          </div>
        </div>
      ) : !progress && (
        <div className="flex justify-end gap-2 pt-1 border-t border-border/60 -mx-4 -mb-4 px-4 pb-4 bg-muted/30 rounded-b-xl">
          <Button variant="ghost" onClick={onClose} className="h-8 text-xs">取消</Button>
          <Button onClick={() => { setSubmitMsg(''); setConfirm(true) }}
            disabled={!canSubmit}
            className="bg-primary hover:bg-primary/90 text-white h-8 text-xs">
            確認申請
          </Button>
        </div>
      )}
    </>
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
      if (data.success) { toast.success('假單已刪除'); onDeleted() }
      else { setMsg(data.message || '刪除失敗'); setConfirm(false) }
    },
  })

  if (msg) return <span className="text-xs text-red-600">{msg}</span>

  if (confirm) {
    return (
      <div className="flex items-center gap-1.5 shrink-0">
        <button onClick={() => mutation.mutate()} disabled={mutation.isPending}
          className="text-xs text-red-600 hover:text-red-700 font-medium disabled:opacity-50 transition-colors">
          {mutation.isPending ? '刪除中...' : '確認'}
        </button>
        <span className="text-muted-foreground/30 text-xs">|</span>
        <button onClick={() => setConfirm(false)} className="text-xs text-muted-foreground/70 hover:text-foreground transition-colors">取消</button>
      </div>
    )
  }

  return (
    <button onClick={() => setConfirm(true)}
      className="text-muted-foreground/50 hover:text-red-400 transition-colors shrink-0 p-1 rounded-md hover:bg-red-500/15">
      <Trash2 className="w-3.5 h-3.5" />
    </button>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

type DialogView = 'notice' | 'form'

function isApproved(status: string) {
  return status === '已核准' || status === '核准'
}
function isPending(status: string) {
  return ['待審核', '送出', '待核准', '待審'].includes(status)
}

export default function LeavesPage() {
  const [start, setStart] = useState(() => toCEInput(thisMonthRange()[0]))
  const [end, setEnd] = useState(() => toCEInput(thisMonthRange()[1]))
  const [query, setQuery] = useState(() => ({
    start: inputValToRoc(toCEInput(thisMonthRange()[0])),
    end: inputValToRoc(toCEInput(thisMonthRange()[1])),
  }))
  const [dialogView, setDialogView] = useState<DialogView | null>(null)
  const queryClient = useQueryClient()

  const { data: leaves, isLoading } = useQuery<LeaveItem[]>({
    queryKey: ['leaves', query],
    queryFn: () => getLeaves(query.start, query.end),
  })

  function handleApplyClick() {
    const acked = sessionStorage.getItem(LEAVE_NOTICE_ACK_KEY)
    setDialogView(acked ? 'form' : 'notice')
  }

  function handleNoticeAck() {
    sessionStorage.setItem(LEAVE_NOTICE_ACK_KEY, '1')
    setDialogView('form')
  }

  function handleLeaveSuccess() {
    setDialogView(null)
    queryClient.invalidateQueries({ queryKey: ['leaves'] })
  }

  function handleDeleted() {
    queryClient.invalidateQueries({ queryKey: ['leaves'] })
  }

  // TrendCard stats
  const total = leaves?.length ?? 0
  const approved = leaves?.filter(l => isApproved(l.teacher_status) && isApproved(l.officer_status)).length ?? 0
  const pending = leaves?.filter(l => isPending(l.teacher_status) || isPending(l.officer_status)).length ?? 0

  return (
    <PageLayout>
      {/* Dialog: Notice + Form */}
      <Dialog
        open={dialogView !== null}
        onOpenChange={open => !open && setDialogView(null)}
      >
        <DialogContent className="sm:max-w-2xl max-h-[92dvh] overflow-y-auto" showCloseButton={dialogView === 'notice'}>
          {dialogView === 'notice' && <LeaveNotice onAck={handleNoticeAck} />}
          {dialogView === 'form' && <LeaveForm onClose={() => setDialogView(null)} onSuccess={handleLeaveSuccess} />}
        </DialogContent>
      </Dialog>

      {/* TrendCards */}
      {leaves && (
        <PageLayout.Trend>
          <PageLayout.TrendCard title="假單總計" value={total} sub="筆" />
          <PageLayout.TrendCard title="已核准" value={approved} sub="筆" />
          <PageLayout.TrendCard title="待審核" value={pending} sub="筆" />
        </PageLayout.Trend>
      )}

      {/* Toolbar */}
      <PageLayout.Toolbar>
        <DateRangePicker
          start={start} end={end}
          onStartChange={setStart} onEndChange={setEnd}
          onQuickApply={(s, e) => setQuery({ start: inputValToRoc(s), end: inputValToRoc(e) })}
        />
        <Button variant="outline"
          onClick={() => setQuery({ start: inputValToRoc(start), end: inputValToRoc(end) })}
          className="self-end">
          查詢
        </Button>
        <Button onClick={handleApplyClick}
          className="bg-primary hover:bg-primary/90 text-white ml-auto self-end">
          <Plus className="w-4 h-4" />
          申請假單
        </Button>
      </PageLayout.Toolbar>

      {/* Table */}
      <PageLayout.Table loading={isLoading}>
        {leaves && (leaves.length === 0 ? (
          <p className="text-muted-foreground/70 text-sm text-center py-10">此區間無假單</p>
        ) : (
          <>
            {/* Desktop */}
            <div className="hidden md:block">
              <table className="w-full text-sm table-fixed">
                <thead>
                  <tr className="bg-muted/30 border-b border-border">
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">事由 / 假單號</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground w-36">請假日期</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground w-24">申請日</th>
                    <th className="text-center px-4 py-2.5 font-medium text-muted-foreground w-24">導師</th>
                    <th className="text-center px-4 py-2.5 font-medium text-muted-foreground w-24">教務</th>
                    <th className="w-12" />
                  </tr>
                </thead>
                <tbody>
                  {leaves.map((l, i) => (
                    <tr key={i} className="border-b border-border/60 last:border-0 align-top hover:bg-accent/40 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-medium text-foreground truncate">{l.reason || '（無事由）'}</p>
                        <p className="text-xs text-muted-foreground/70 mt-0.5 tabular-nums">#{l.barcode || l.index}</p>
                        {l.teacher_note && l.teacher_note !== '/' && (
                          <p className="text-xs text-muted-foreground/70 mt-0.5 truncate">導師：{l.teacher_note}</p>
                        )}
                        {l.officer_note && l.officer_note !== '/' && (
                          <p className="text-xs text-muted-foreground/70 truncate">教務：{l.officer_note}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground tabular-nums text-xs">
                        {l.start_date === l.end_date ? l.start_date : `${l.start_date} — ${l.end_date}`}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground/70 tabular-nums text-xs">{l.apply_date}</td>
                      <td className="px-4 py-3 text-center"><StatusBadge label={l.teacher_status} /></td>
                      <td className="px-4 py-3 text-center"><StatusBadge label={l.officer_status} /></td>
                      <td className="px-4 py-3 text-center">
                        {l.can_delete && <DeleteButton leave={l} onDeleted={handleDeleted} />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile */}
            <div className="md:hidden divide-y divide-border/60">
              {leaves.map((l, i) => (
                <div key={i} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-foreground truncate">{l.reason || '（無事由）'}</p>
                      <p className="text-xs text-muted-foreground/70 tabular-nums">#{l.barcode || l.index}</p>
                    </div>
                    {l.can_delete && <DeleteButton leave={l} onDeleted={handleDeleted} />}
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground tabular-nums">
                    {l.start_date === l.end_date ? l.start_date : `${l.start_date} — ${l.end_date}`}
                  </p>
                  <p className="text-xs text-muted-foreground/70">申請：{l.apply_date}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="text-xs text-muted-foreground/70">導師</span><StatusBadge label={l.teacher_status} />
                    <span className="text-xs text-muted-foreground/70">教務</span><StatusBadge label={l.officer_status} />
                  </div>
                </div>
              ))}
            </div>
          </>
        ))}
      </PageLayout.Table>
    </PageLayout>
  )
}
