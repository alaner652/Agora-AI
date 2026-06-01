import { Skeleton } from '@/components/ui/skeleton'
import { PageLayout } from '@/components/PageLayout'

export default function AbsenceLoading() {
  return (
    <PageLayout>
      <PageLayout.Trend>
        {[...Array(3)].map((_, i) => (
          <div key={i} className="rounded-xl border border-border bg-card p-4 space-y-2">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-7 w-10" />
            <Skeleton className="h-2.5 w-8" />
          </div>
        ))}
      </PageLayout.Trend>

      {/* Toolbar */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Skeleton className="h-3 w-8" />
          <Skeleton className="h-9 w-40" />
        </div>
        <div className="space-y-1.5">
          <Skeleton className="h-3 w-8" />
          <Skeleton className="h-9 w-32" />
        </div>
        <div className="space-y-1.5">
          <Skeleton className="h-3 w-12" />
          <Skeleton className="h-9 w-56" />
        </div>
        <Skeleton className="h-9 w-20 self-end" />
      </div>

      {/* Absence table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="flex gap-3 px-4 py-3 border-b border-border bg-muted/20">
          <Skeleton className="h-3 w-8 shrink-0" />
          <Skeleton className="h-3 w-28 shrink-0" />
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-3 w-10" />)}
        </div>
        {[...Array(7)].map((_, i) => (
          <div key={i} className="flex gap-3 px-4 py-2.5 border-b border-border last:border-0 items-center">
            <Skeleton className="h-3 w-8 shrink-0" />
            <Skeleton className="h-3 w-28 shrink-0" />
            {[...Array(6)].map((_, j) => (
              <Skeleton key={j} className={`h-5 w-10 rounded ${j % 3 === 0 ? 'opacity-100' : 'opacity-0'}`} />
            ))}
          </div>
        ))}
      </div>
    </PageLayout>
  )
}
