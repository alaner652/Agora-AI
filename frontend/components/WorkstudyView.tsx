'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { CalendarCheck, X } from 'lucide-react'
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

const SLOTS = [
  { key: '0800', label: '08:00–09:00' },
  { key: '1200', label: '12:00–13:00' },
] as const
const WEEKDAYS = [1, 2, 3, 4, 5]
const WD_LABEL = ['', '一', '二', '三', '四', '五', '六', '日']

function recordKey(r: WorkstudyRecord) { return `${r.year}-${r.month}-${r.unit_id}` }
function partMonth(r: WorkstudyRecord) {
  return `${r.year.padStart(3, '0')}${r.month.padStart(2, '0')}`
}
// 民國 YYYMMDD → M/D
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

  // pattern: 星期 → 已選時段
  const [pattern, setPattern] = useState<Record<number, Set<string>>>({})
  const [monthCap, setMonthCap] = useState(20)
  const [useGuard, setUseGuard] = useState(true)
  const [skip, setSkip] = useState<string[]>([])
  const [plan, setPlan] = useState<WorkstudyPlan | null>(null)
  const [confirm, setConfirm] = useState(false)

  function patternToObj(): Record<string, string[]> {
    const out: Record<string, string[]> = {}
    for (const wd of WEEKDAYS) {
      const set = pattern[wd]
      if (set && set.size) out[String(wd)] = [...set]
    }
    return out
  }
  const patternCount = WEEKDAYS.reduce((n, wd) => n + (pattern[wd]?.size ?? 0), 0)

  function toggle(wd: number, slot: string) {
    setPlan(null); setConfirm(false)
    setPattern(prev => {
      const set = new Set(prev[wd] ?? [])
      set.has(slot) ? set.delete(slot) : set.add(slot)
      return { ...prev, [wd]: set }
    })
  }

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
        setPlan(null); setConfirm(false); router.refresh()
      } else {
        toast.error(data.message || '存檔失敗')
        setConfirm(false)
      }
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
          <Select value={selKey} onValueChange={v => { if (v == null) return; setSelKey(v); setPattern({}); setPlan(null); setConfirm(false) }}>
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
              勾選你<span className="text-primary">實際固定值班</span>的時段，系統依此攤開整月。送出為整月覆蓋。
            </p>
          </div>

          {/* 班表格 */}
          <div className="overflow-x-auto">
            <table className="text-sm">
              <thead>
                <tr className="text-muted-foreground">
                  <th className="px-2 py-1 text-left font-medium">星期</th>
                  {SLOTS.map(s => <th key={s.key} className="px-2 py-1 font-medium">{s.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {WEEKDAYS.map(wd => (
                  <tr key={wd}>
                    <td className="px-2 py-1.5 text-muted-foreground">週{WD_LABEL[wd]}</td>
                    {SLOTS.map(s => {
                      const on = pattern[wd]?.has(s.key)
                      return (
                        <td key={s.key} className="px-2 py-1.5 text-center">
                          <button type="button" onClick={() => toggle(wd, s.key)}
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

          {/* 選項 */}
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">每月上限（小時）</label>
              <Input type="number" min={0} max={30} value={monthCap}
                onChange={e => { setMonthCap(Number(e.target.value)); setPlan(null) }}
                className="w-28" />
            </div>
            <label className="flex items-center gap-2 text-xs text-muted-foreground pb-2.5 cursor-pointer">
              <input type="checkbox" checked={useGuard}
                onChange={e => { setUseGuard(e.target.checked); setPlan(null) }} />
              用課表空堂防呆（排到上課時間自動略過）
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
                      {fmtMD(e.date)} {e.t_in}-{e.t_out}
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
