import { Skeleton } from '@/components/ui/skeleton'
import { PageLayout } from '@/components/PageLayout'

export default function ScheduleLoading() {
  return (
    <PageLayout>
      <PageLayout.Trend>
        {[...Array(3)].map((_, i) => (
          <div key={i} className="rounded-xl border border-border bg-card/70 p-4 space-y-2 backdrop-blur-xl">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-7 w-8" />
            <Skeleton className="h-2.5 w-6" />
          </div>
        ))}
      </PageLayout.Trend>

      <div className="flex items-end gap-3">
        <div className="space-y-1.5">
          <Skeleton className="h-3 w-8" />
          <Skeleton className="h-9 w-40" />
        </div>
      </div>

      {/* Calendar skeleton */}
      <div className="rounded-xl border border-border bg-card/70 overflow-hidden backdrop-blur-xl">
        <div className="flex border-b border-border">
          <div className="w-12 shrink-0 border-r border-border h-10" />
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex-1 h-10 flex items-center justify-center border-r border-border last:border-0">
              <Skeleton className="h-7 w-7 rounded-full" />
            </div>
          ))}
        </div>
        <div className="flex" style={{ height: 340 }}>
          <div className="w-12 shrink-0 border-r border-border p-2 space-y-8 pt-4">
            {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-2.5 w-6 ml-auto" />)}
          </div>
          {[...Array(5)].map((_, col) => (
            <div key={col} className="flex-1 border-r border-border last:border-0 relative p-1">
              <Skeleton
                className="absolute inset-x-1 rounded"
                style={{
                  top: [24, 88, 52, 32, 72][col],
                  height: [64, 48, 80, 56, 40][col],
                }}
              />
              {col % 2 === 0 && (
                <Skeleton
                  className="absolute inset-x-1 rounded"
                  style={{
                    top: [160, 200, 180][col % 3],
                    height: [48, 64, 56][col % 3],
                  }}
                />
              )}
            </div>
          ))}
        </div>
      </div>
    </PageLayout>
  )
}
