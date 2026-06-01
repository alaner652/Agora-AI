import type { ReactNode } from 'react'
import { Skeleton } from '@/components/ui/skeleton'

// ── Root ──────────────────────────────────────────────────────────────────────

function Root({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-4 p-4 sm:p-6">{children}</div>
}

// ── Trend ─────────────────────────────────────────────────────────────────────

function Trend({ children }: { children: ReactNode }) {
  return (
    <div className="grid auto-rows-min gap-4 md:grid-cols-3">
      {children}
    </div>
  )
}

// ── TrendCard ─────────────────────────────────────────────────────────────────

function TrendCard({ title, value, sub, children }: {
  title?: string
  value?: string | number
  sub?: string
  children?: ReactNode
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      {title && <p className="text-xs text-muted-foreground mb-1">{title}</p>}
      {value !== undefined && (
        <p className="text-2xl font-semibold text-foreground">{value}</p>
      )}
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      {children}
    </div>
  )
}

// ── Toolbar ───────────────────────────────────────────────────────────────────

function Toolbar({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      {children}
    </div>
  )
}

// ── Table ─────────────────────────────────────────────────────────────────────

interface TableProps {
  children: ReactNode
  loading?: boolean
  skeletonRows?: number
}

function Table({ children, loading = false, skeletonRows = 5 }: TableProps) {
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      {loading ? (
        <div>
          <div className="flex gap-4 px-4 py-3 border-b border-border bg-muted/20">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className={`h-3 ${i === 0 ? 'w-28' : i === 4 ? 'w-16' : 'flex-1'}`} />
            ))}
          </div>
          {[...Array(skeletonRows)].map((_, i) => (
            <div key={i} className="flex gap-4 px-4 py-3.5 border-b border-border last:border-0 items-center">
              {[...Array(5)].map((_, j) => (
                <Skeleton key={j} className={`h-3 ${j === 0 ? 'w-28 shrink-0' : j === 4 ? 'w-16' : 'flex-1'}`} />
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto">{children}</div>
      )}
    </div>
  )
}

// ── Export ────────────────────────────────────────────────────────────────────

export const PageLayout = Object.assign(Root, { Trend, TrendCard, Toolbar, Table })
