import { Skeleton } from '@/components/ui/skeleton'
import { PageLayout } from '@/components/PageLayout'

export default function LeavesLoading() {
  return (
    <PageLayout>
      {/* TrendCards：假單總計 / 已核准 / 待審核 */}
      <PageLayout.Trend>
        {[...Array(3)].map((_, i) => (
          <div key={i} className="rounded-xl border border-border bg-card/70 p-4 space-y-2 backdrop-blur-xl">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-7 w-8" />
            <Skeleton className="h-2.5 w-6" />
          </div>
        ))}
      </PageLayout.Trend>

      {/* Toolbar：日期範圍 + 查詢 + 申請假單 */}
      <div className="flex flex-wrap items-end gap-3">
        {/* DateRangePicker */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <Skeleton className="h-3 w-12" />
            <Skeleton className="h-3 w-6" />
            <Skeleton className="h-3 w-6" />
            <Skeleton className="h-3 w-8" />
          </div>
          <Skeleton className="h-9 w-48" />
        </div>
        <Skeleton className="h-9 w-16 self-end" />
        <Skeleton className="h-9 w-28 self-end ml-auto" />
      </div>

      {/* Leaves table */}
      <div className="rounded-xl border border-border bg-card/70 overflow-hidden backdrop-blur-xl">
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
