import { Skeleton } from '@/components/ui/skeleton'
import { PageLayout } from '@/components/PageLayout'

export default function LeavesLoading() {
  return (
    <PageLayout>
      {/* Toolbar */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Skeleton className="h-3 w-12" />
          <Skeleton className="h-9 w-56" />
        </div>
        <Skeleton className="h-9 w-20 self-end" />
        <Skeleton className="h-9 w-24 self-end" />
      </div>

      {/* Leaves table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="flex gap-4 px-4 py-3 border-b border-border bg-muted/20">
          <Skeleton className="h-3 flex-1" />
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-3 w-20" />
        </div>
        {[...Array(6)].map((_, i) => (
          <div key={i} className="flex gap-4 px-4 py-3.5 border-b border-border last:border-0 items-start">
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-48" />
              <Skeleton className="h-2.5 w-24" />
            </div>
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
        ))}
      </div>
    </PageLayout>
  )
}
