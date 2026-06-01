'use client'

import { useState, type ReactNode } from 'react'
import { Copy, Check } from 'lucide-react'

// ── Card ──────────────────────────────────────────────────────────────────────

export function SettingCard({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-border bg-card p-4 space-y-4">{children}</div>
}

export function SettingCardHeader({ title, description, status }: {
  title: string; description?: string; status?: ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-2">
      <div>
        <p className="text-sm font-medium text-foreground">{title}</p>
        {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
      </div>
      {status}
    </div>
  )
}

export function FieldLabel({ children }: { children: ReactNode }) {
  return <p className="text-xs text-muted-foreground mb-1.5">{children}</p>
}

// ── Slider (label left, value right, range below) ─────────────────────────────

export function Slider({ label, value, min, max, step, format, onChange }: {
  label: string; value: number; min: number; max: number; step: number
  format: (v: number) => string; onChange: (v: number) => void
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-xs font-mono text-foreground">{format(value)}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        className="w-full h-1 rounded-full appearance-none bg-border cursor-pointer accent-primary" />
    </div>
  )
}

// ── Info row (label / value / optional action) ────────────────────────────────

export function InfoRow({ label, value, mono, action }: {
  label: string; value: string; mono?: boolean; action?: ReactNode
}) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-border/60 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="flex items-center gap-2">
        <span className={`text-sm text-foreground ${mono ? 'font-mono' : ''}`}>{value}</span>
        {action}
      </span>
    </div>
  )
}

// ── Copy button ───────────────────────────────────────────────────────────────

export function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button onClick={() => navigator.clipboard.writeText(value).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 1500)
    })} className="text-muted-foreground/50 hover:text-foreground transition-colors">
      {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
    </button>
  )
}

// ── Danger row (inline confirm, no confirm() dialog) ──────────────────────────

export function DangerRow({ title, description, action, onConfirm }: {
  title: string; description: string; action: string; onConfirm: () => Promise<void>
}) {
  const [confirming, setConfirming] = useState(false)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<'ok' | 'err' | null>(null)

  async function run() {
    setLoading(true)
    try {
      await onConfirm()
      setResult('ok'); setConfirming(false)
      setTimeout(() => setResult(null), 3000)
    } catch {
      setResult('err')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-start justify-between gap-4 py-3 border-b border-border/60 last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-sm text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground/70 mt-0.5">{description}</p>
        {result === 'ok' && <p className="text-xs text-emerald-400 mt-1">✓ 完成</p>}
        {result === 'err' && <p className="text-xs text-red-400 mt-1">✗ 失敗，請重試</p>}
      </div>
      <div className="shrink-0 flex items-center gap-2">
        {confirming ? (
          <>
            <button onClick={run} disabled={loading}
              className="text-xs text-red-400 hover:text-red-300 transition-colors disabled:opacity-50">
              {loading ? '處理中…' : '確認'}
            </button>
            <span className="text-muted-foreground/30 text-xs">|</span>
            <button onClick={() => setConfirming(false)}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors">
              取消
            </button>
          </>
        ) : (
          <button onClick={() => setConfirming(true)}
            className="text-xs text-muted-foreground hover:text-red-400 border border-border hover:border-red-500/30 px-2.5 py-1 rounded-lg transition-colors">
            {action}
          </button>
        )}
      </div>
    </div>
  )
}
