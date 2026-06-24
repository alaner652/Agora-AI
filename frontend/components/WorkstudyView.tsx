'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { CalendarCheck, Plus, X } from 'lucide-react'
import {
  planWorkstudy, saveWorkstudy,
  type WorkstudyMaster, type WorkstudyRecord, type WorkstudyPlan,
} from '@/lib/data'
import { SemesterSelect } from '@/components/SemesterSelect'
import { PageLayout } from '@/components/PageLayout'
import { LoadError } from '@/components/LoadError'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import type { SemesterOption } from '@/lib/data'

interface Slot { t_in: string; t_out: string }   // HHMM

// 便利預設；使用者可自行增刪（每個人固定值班時段不同）
const DEFAULT_SLOTS: Slot[] = [
  { t_in: '0800', t_out: '0900' },
  { t_in: '1200', t_out: '1300' },
]
const WEEKDAYS = [1, 2, 3, 4, 5]
const WD_LABEL = ['', '一', '二', '三', '四', '五', '六', '日']

const hhmmToTime = (s: string) => `${s.slice(0, 2)}:${s.slice(2)}`
const timeToHhmm = (s: string) => s.replace(':', '')
const toMin = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(2))
const slotKey = (s: Slot) => `${s.t_in}-${s.t_out}`
const slotHours = (s: Slot) => (toMin(s.t_out) - toMin(s.t_in)) / 60
const slotLabel = (s: Slot) => `${hhmmToTime(s.t_in)}–${hhmmToTime(s.t_out)}`

function recordKey(r: WorkstudyRecord) { return `${r.year}-${r.month}-${r.unit_id}` }
function partMonth(r: WorkstudyRecord) {
  return `${r.year.padStart(3, '0')}${r.month.padStart(2, '0')}`
}
function fmtMD(d: string) {
  return /^\d{7}$/.test(d) ? `${Number(d.slice(3, 5))}/${Number(d.slice(5, 7))}` : d
}
function statusCls(s: string) {
  if (s.includes('未送件')) return 'text-amber-400 bg-amber-500/15'
  if (s.includes('已送件')) return 'text-emerald-400 bg-emerald-500/15'
  return 'text-muted-foreground bg-muted'
}

interface Props {
  semester: string
  options: SemesterOption[]
  master: WorkstudyMaster | null
}

export function WorkstudyView({ semester, options, master }: Props) {
  const router = useRouter()
  const records = master?.records ?? []
  const [year, sms] = semester.split(',').map(s => s.trim())

  const [selKey, setSelKey] = useState(() => {
    const editable = records.find(r => r.editable)
    return editable ? recordKey(editable) : records[0] ? recordKey(records[0]) : ''
  })
  const record = records.find(r => recordKey(r) === selKey) ?? null

  // 自訂時段清單 + 班表勾選（星期 → 已選時段 key）
  const [slots, setSlots] = useState<Slot[]>(DEFAULT_SLOTS)
  const [pattern, setPattern] = useState<Record<number, Set<string>>>({})
  const [newIn, setNewIn] = useState('08:00')
  const [newOut, setNewOut] = useState('09:00')
  const [monthCap, setMonthCap] = useState(20)
  const [useGuard, setUseGuard] = useState(true)
  const [skip, setSkip] = useState<string[]>([])
  const [plan, setPlan] = useState<WorkstudyPlan | null>(null)
  const [confirm, setConfirm] = useState(false)

  function reset() { setPlan(null); setConfirm(false) }

  function addSlot() {
    const t_in = timeToHhmm(newIn), t_out = timeToHhmm(newOut)
    if (toMin(t_out) <= toMin(t_in)) { toast.error('結束時間需晚於開始時間'); return }
    const s: Slot = { t_in, t_out }
    if (slots.some(x => slotKey(x) === slotKey(s))) { toast.error('已有相同時段'); return }
    setSlots([...slots, s].sort((a, b) => toMin(a.t_in) - toMin(b.t_in)))
    reset()
  }

  function removeSlot(key: string) {
    setSlots(slots.filter(s => slotKey(s) !== key))
    setPattern(prev => {
      const next: Record<number, Set<string>> = {}
      for (const [wd, set] of Object.entries(prev)) {
        const cleaned = new Set([...set].filter(k => k !== key))
        if (cleaned.size) next[Number(wd)] = cleaned
      }
      return next
    })
    reset()
  }

  function toggle(wd: number, key: string) {
    reset()
    setPattern(prev => {
      const set = new Set(prev[wd] ?? [])
      set.has(key) ? set.delete(key) : set.add(key)
      return { ...prev, [wd]: set }
    })
  }

  function patternToObj(): Record<string, [string, string][]> {
    const byKey = new Map(slots.map(s => [slotKey(s), s]))
    const out: Record<string, [string, string][]> = {}
    for (const wd of WEEKDAYS) {
      const set = pattern[wd]
      if (!set?.size) continue
      out[String(wd)] = [...set]
        .map(k => byKey.get(k))
        .filter((s): s is Slot => !!s)
        .map(s => [s.t_in, s.t_out])
    }
    return out
  }
  const patternCount = WEEKDAYS.reduce((n, wd) => n + (pattern[wd]?.size ?? 0), 0)

  const previewMut = useMutation({
    mutationFn: (skipDates: string[]) => planWorkstudy({
      part_month: partMonth(record!),
      pattern: patternToObj(),
      skip_dates: skipDates,
      month_cap: monthCap,
      semester,
      use_schedule_guard: useGuard,
    }),
    onSuccess: data => setPlan(data),
    onError: () => toast.error('預覽失敗，請稍後再試'),
  })

  const saveMut = useMutation({
    mutationFn: () => saveWorkstudy({
      year, sms,
      part_month: partMonth(record!),
      unit_id: record!.unit_id,
      kind_id: record!.kind_id,
      kind_name: record!.kind,
      entries: plan!.entries,
    }),
    onSuccess: data => {
      if (data.success) {
        toast.success('工讀考勤已存檔')
        reset(); router.refresh()
      } else { toast.error(data.message || '存檔失敗'); setConfirm(false) }
    },
    onError: () => { toast.error('存檔失敗，請稍後再試'); setConfirm(false) },
  })

  function doPreview() { setSkip([]); previewMut.mutate([]) }
  function removeEntry(date: string) {
    const next = [...new Set([...skip, date])]
    setSkip(next); setConfirm(false); previewMut.mutate(next)
  }

  if (!master) return <PageLayout><LoadError /></PageLayout>

  return (
    <PageLayout>
      <PageLayout.Trend>
        <PageLayout.TrendCard title="本期可登錄月份" value={records.length} sub="個月主檔" />
        <PageLayout.TrendCard title="選定月時數" value={record ? `${record.hours}h` : '—'} sub={record ? `${record.year} 年 ${record.month} 月` : ''} />
        <PageLayout.TrendCard title="核銷狀態">
          {record
            ? <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-medium ${statusCls(record.status)}`}>{record.status}</span>
            : <span className="text-muted-foreground">—</span>}
        </PageLayout.TrendCard>
      </PageLayout.Trend>

      <PageLayout.Toolbar>
        <div>
          <label className="block text-xs text-muted-foreground mb-1">學年期</label>
          <SemesterSelect options={options} current={semester} />
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1">月份</label>
          <Select value={selKey} onValueChange={v => { if (v == null) return; setSelKey(v); setPattern({}); reset() }}>
            <SelectTrigger className="min-w-56">
              <SelectValue displayValue={record ? `${record.year}年${record.month}月 · ${record.status}` : '無可登錄月份'} />
            </SelectTrigger>
            <SelectContent>
              {records.map(r => (
                <SelectItem key={recordKey(r)} value={recordKey(r)}>
                  {r.year}年{r.month}月 · {r.unit} · {r.hours}h · {r.status}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </PageLayout.Toolbar>

      {records.length === 0 && (
        <p className="text-muted-foreground text-sm text-center py-10">
          此學期尚無工讀月份主檔。請先於校務系統建檔後再登錄。
        </p>
      )}

      {record && !record.editable && (
        <div className="rounded-xl border border-border bg-card/70 p-4 text-sm text-muted-foreground backdrop-blur-xl">
          此月為「{record.status}」，僅能查詢、不可更改。
        </div>
      )}

      {record && record.editable && (
        <div className="rounded-xl border border-border bg-card/70 p-4 sm:p-5 backdrop-blur-xl space-y-5">
          <div>
            <h3 className="text-sm font-medium text-foreground mb-1">固定班表</h3>
            <p className="text-xs text-muted-foreground/70">
              先定義你的<span className="text-primary">值班時段</span>，再勾選每週實際固定會去的格子。送出為整月覆蓋。
            </p>
          </div>

          {/* 時段定義 */}
          <div className="space-y-2">
            <label className="block text-xs font-medium text-muted-foreground">值班時段</label>
            <div className="flex flex-wrap items-center gap-2">
              {slots.map(s => (
                <span key={slotKey(s)} className="inline-flex items-center gap-1 text-xs bg-accent/50 border border-border rounded-lg px-2 py-1 text-foreground/80">
                  {slotLabel(s)} <span className="text-muted-foreground/60">({slotHours(s)}h)</span>
                  <button type="button" onClick={() => removeSlot(slotKey(s))}
                    className="text-muted-foreground/40 hover:text-red-400 transition-colors">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
              <span className="inline-flex items-center gap-1">
                <input type="time" step={1800} value={newIn} onChange={e => setNewIn(e.target.value)}
                  className="bg-card border border-border rounded-lg px-2 py-1 text-xs" />
                <span className="text-muted-foreground/50 text-xs">–</span>
                <input type="time" step={1800} value={newOut} onChange={e => setNewOut(e.target.value)}
                  className="bg-card border border-border rounded-lg px-2 py-1 text-xs" />
                <button type="button" onClick={addSlot}
                  className="inline-flex items-center gap-0.5 text-xs text-primary hover:underline px-1.5 py-1">
                  <Plus className="w-3.5 h-3.5" />加入
                </button>
              </span>
            </div>
          </div>

          {/* 班表格 */}
          {slots.length === 0 ? (
            <p className="text-xs text-muted-foreground/70">請先加入至少一個值班時段。</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="text-sm">
                <thead>
                  <tr className="text-muted-foreground">
                    <th className="px-2 py-1 text-left font-medium">星期</th>
                    {slots.map(s => (
                      <th key={slotKey(s)} className="px-2 py-1 font-medium whitespace-nowrap">{slotLabel(s)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {WEEKDAYS.map(wd => (
                    <tr key={wd}>
                      <td className="px-2 py-1.5 text-muted-foreground">週{WD_LABEL[wd]}</td>
                      {slots.map(s => {
                        const key = slotKey(s)
                        const on = pattern[wd]?.has(key)
                        return (
                          <td key={key} className="px-2 py-1.5 text-center">
                            <button type="button" onClick={() => toggle(wd, key)}
                              className={`px-3 py-1 rounded-lg text-xs font-medium border transition-colors ${
                                on ? 'bg-primary text-white border-primary'
                                   : 'bg-card text-muted-foreground border-border hover:bg-accent/50'}`}>
                              {on ? '值班' : '—'}
                            </button>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* 選項 */}
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">每月上限（小時）</label>
              <Input type="number" min={0} max={30} value={monthCap}
                onChange={e => { setMonthCap(Number(e.target.value)); reset() }}
                className="w-28" />
            </div>
            <label className="flex items-center gap-2 text-xs text-muted-foreground pb-2.5 cursor-pointer">
              <input type="checkbox" checked={useGuard}
                onChange={e => { setUseGuard(e.target.checked); reset() }} />
              用課表空堂防呆（與上課時間重疊自動略過）
            </label>
            <Button onClick={doPreview} disabled={patternCount === 0 || previewMut.isPending}
              variant="outline" className="ml-auto self-end">
              <CalendarCheck className="w-4 h-4" />
              {previewMut.isPending ? '計算中…' : '預覽當月'}
            </Button>
          </div>

          {/* 預覽結果 */}
          {plan && (
            <div className="border-t border-border/60 pt-4 space-y-3">
              <p className="text-sm text-foreground">
                本月共 <span className="text-primary font-semibold">{plan.count}</span> 段／
                <span className="text-primary font-semibold">{plan.total_hours.toFixed(1)}</span> 小時
                {plan.count === 0 && <span className="text-amber-600 ml-2">（無符合的時段，請調整班表或關閉防呆）</span>}
              </p>

              {plan.entries.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {plan.entries.map(e => (
                    <span key={e.date + e.t_in}
                      className="group inline-flex items-center gap-1 text-xs bg-card border border-border rounded-lg px-2 py-1 text-muted-foreground">
                      {fmtMD(e.date)} {hhmmToTime(e.t_in)}-{hhmmToTime(e.t_out)}
                      <button type="button" onClick={() => removeEntry(e.date)}
                        title="這天沒去，移除"
                        className="text-muted-foreground/40 hover:text-red-400 transition-colors">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              {plan.entries.length > 0 && (
                confirm ? (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                    <p className="text-sm text-amber-700 font-medium mb-1">確認整月覆蓋送出？</p>
                    <p className="text-xs text-amber-700">
                      {record.year} 年 {record.month} 月 · {plan.count} 段 / {plan.total_hours.toFixed(1)} 小時。
                      送出後將<span className="font-medium">取代</span>該月原有紀錄。
                    </p>
                    <div className="flex gap-2 mt-3">
                      <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}
                        className="bg-primary hover:bg-primary/90 text-white h-8 text-xs">
                        {saveMut.isPending ? '送出中…' : '確認送出'}
                      </Button>
                      <Button variant="outline" onClick={() => setConfirm(false)} className="h-8 text-xs">返回</Button>
                    </div>
                  </div>
                ) : (
                  <Button onClick={() => setConfirm(true)}
                    className="bg-primary hover:bg-primary/90 text-white">
                    送出登錄
                  </Button>
                )
              )}
            </div>
          )}
        </div>
      )}
    </PageLayout>
  )
}
