import { unstable_rethrow } from 'next/navigation'
import Link from 'next/link'
import { serverFetch } from '@/lib/api-server'
import { SettingCard, InfoRow, CopyButton } from '@/components/settings/primitives'
import { LoadError } from '@/components/LoadError'
import type { FullSettingsResponse, TokenUsageResponse } from '@/lib/data'

function fmt(n: number) {
  return n.toLocaleString('zh-TW')
}

export default async function GeneralSettingsPage() {
  let data: FullSettingsResponse
  let usage: TokenUsageResponse
  try {
    ;[data, usage] = await Promise.all([
      serverFetch<FullSettingsResponse>('/api/settings'),
      serverFetch<TokenUsageResponse>('/api/settings/usage'),
    ])
  } catch (e) {
    unstable_rethrow(e)
    return <LoadError />
  }

  const { uid, llm_status } = data

  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(new Date())
  const todayData = usage.days.find(d => d.date === today)
  const todayTotal = todayData ? todayData.prompt + todayData.completion : 0
  const hasUsage = usage.total_prompt + usage.total_completion > 0
  const maxDayTotal = Math.max(...usage.days.map(d => d.prompt + d.completion), 1)

  return (
    <>
      <SettingCard>
        <p className="font-heading text-sm font-semibold text-foreground">帳號</p>
        <div className="-mt-2">
          <InfoRow label="學號" value={uid} mono action={<CopyButton value={uid} />} />
        </div>
      </SettingCard>

      <SettingCard>
        <p className="font-heading text-sm font-semibold text-foreground">AI 模型</p>

        {llm_status.has_custom_config ? (
          <div className="flex items-center justify-between -mt-1">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
              <span className="text-sm text-foreground font-mono">{llm_status.model}</span>
            </div>
            <Link href="/settings/llm" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
              變更
            </Link>
          </div>
        ) : (
          <div className="space-y-3 -mt-1">
            <p className="text-xs text-muted-foreground">
              尚未設定 API 金鑰，AI 對話功能目前無法使用
            </p>
            <Link
              href="/settings/llm"
              className="inline-flex text-xs font-medium text-primary hover:text-primary/80 transition-colors"
            >
              前往設定金鑰 →
            </Link>
          </div>
        )}
      </SettingCard>

      <SettingCard>
        <div className="flex items-start justify-between gap-2">
          <p className="font-heading text-sm font-semibold text-foreground">Token 用量</p>
          <span className="text-[11px] text-muted-foreground/60 text-right leading-relaxed">
            每日午夜重置<br />（台灣時間）
          </span>
        </div>

        {!hasUsage ? (
          <p className="text-xs text-muted-foreground">尚無 AI 對話記錄</p>
        ) : (
          <>
            {/* 今日用量 */}
            <div className="rounded-lg bg-primary/5 border border-primary/10 px-4 py-3 -mt-1">
              <p className="text-[11px] text-muted-foreground mb-0.5">今日</p>
              <p className="text-2xl font-semibold font-mono text-foreground tabular-nums">
                {fmt(todayTotal)}
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                tokens
                {todayData && todayData.turns > 0 && (
                  <span className="ml-1.5 text-muted-foreground/60">· {todayData.turns} 則對話</span>
                )}
              </p>
            </div>

            {/* 每日 bar chart */}
            <div className="space-y-2">
              {usage.days.map(d => {
                const total = d.prompt + d.completion
                const pct = Math.round((total / maxDayTotal) * 100)
                const isToday = d.date === today
                const mmdd = d.date.slice(5).replace('-', '/')
                return (
                  <div key={d.date} className="flex items-center gap-2.5">
                    <span className={`w-10 shrink-0 text-right text-xs tabular-nums ${
                      isToday ? 'text-foreground font-medium' : 'text-muted-foreground'
                    }`}>
                      {mmdd}
                    </span>
                    <div className="flex-1 h-1.5 rounded-full bg-border overflow-hidden">
                      <div
                        className={`h-full rounded-full ${isToday ? 'bg-primary' : 'bg-primary/40'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="w-20 shrink-0 text-right text-xs font-mono text-muted-foreground tabular-nums">
                      {fmt(total)}
                    </span>
                    {d.turns > 0 && (
                      <span className="w-10 shrink-0 text-right text-[11px] text-muted-foreground/50 tabular-nums">
                        {d.turns}則
                      </span>
                    )}
                  </div>
                )
              })}
            </div>

            {/* 7 天合計 */}
            <div className="pt-1 border-t border-border/60 space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">7 天合計</span>
                <span className="font-mono text-foreground tabular-nums">
                  {fmt(usage.total_prompt + usage.total_completion)} tokens
                </span>
              </div>
              <div className="flex justify-between text-[11px] text-muted-foreground/60">
                <span>輸入 {fmt(usage.total_prompt)}</span>
                <span>輸出 {fmt(usage.total_completion)}</span>
              </div>
              {usage.total_turns > 0 && (
                <div className="text-[11px] text-muted-foreground/50">
                  共 {usage.total_turns} 則對話，平均每則約{' '}
                  {fmt(Math.round((usage.total_prompt + usage.total_completion) / usage.total_turns))} tokens
                </div>
              )}
            </div>
          </>
        )}
      </SettingCard>
    </>
  )
}
