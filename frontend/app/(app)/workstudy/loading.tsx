import { Skeleton } from '@/components/ui/skeleton'
import { PageLayout } from '@/components/PageLayout'

export default function WorkstudyLoading() {
  return (
    <PageLayout>
      {/* TrendCards：可登錄月份 / 選定月時數 / 核銷狀態 */}
      <PageLayout.Trend>
        {[...Array(3)].map((_, i) => (
          <div key={i} className="rounded-xl border border-border bg-card/70 p-4 space-y-2 backdrop-blur-xl">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-7 w-12" />
            <Skeleton className="h-2.5 w-16" />
          </div>
        ))}
      </PageLayout.Trend>

      {/* Toolbar：學年期 + 月份 */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Skeleton className="h-3 w-12" />
          <Skeleton className="h-9 w-44" />
        </div>
        <div className="space-y-1.5">
          <Skeleton className="h-3 w-8" />
          <Skeleton className="h-9 w-56" />
        </div>
      </div>

      {/* 固定班表卡片 */}
      <div className="rounded-xl border border-border bg-card/70 p-5 space-y-4 backdrop-blur-xl">
        <Skeleton className="h-4 w-24" />
        {[...Array(5)].map((_, i) => (
          <div key={i} className="flex gap-3 items-center">
            <Skeleton className="h-6 w-10" />
            <Skeleton className="h-7 w-28" />
            <Skeleton className="h-7 w-28" />
          </div>
        ))}
        <Skeleton className="h-9 w-32 ml-auto" />
      </div>
    </PageLayout>
  )
}
