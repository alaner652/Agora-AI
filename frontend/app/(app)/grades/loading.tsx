import { Skeleton } from '@/components/ui/skeleton'
import { PageLayout } from '@/components/PageLayout'

export default function GradesLoading() {
  return (
    <PageLayout>
      <PageLayout.Trend>
        {[...Array(3)].map((_, i) => (
          <div key={i} className="rounded-xl border border-border bg-card/70 p-4 space-y-2 backdrop-blur-xl">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-7 w-12" />
            <Skeleton className="h-2.5 w-24" />
          </div>
        ))}
      </PageLayout.Trend>

      <div className="flex items-end gap-3">
        <div className="space-y-1.5">
          <Skeleton className="h-3 w-8" />
          <Skeleton className="h-9 w-44" />
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card/70 overflow-hidden backdrop-blur-xl">
        {/* Table header */}
        <div className="flex gap-4 px-4 py-3 border-b border-border bg-muted/20">
          <Skeleton className="h-3 flex-1" />
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 w-12" />
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 w-14" />
        </div>
        {[...Array(8)].map((_, i) => (
          <div key={i} className="flex gap-4 px-4 py-3 border-b border-border last:border-0 items-center">
            <Skeleton className="h-3 flex-1" />
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-8" />
            <Skeleton className="h-5 w-14 rounded-full" />
            <Skeleton className="h-5 w-12 rounded-full" />
          </div>
        ))}
        <div className="flex gap-4 px-4 py-3 border-t border-border bg-muted/20">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-3 w-20" />
        </div>
      </div>
    </PageLayout>
  )
}
