import { Skeleton } from '@/components/ui/skeleton'

function TrendCardSkeleton() {
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-4">
      <Skeleton className="h-3 w-16 mb-2" />
      <Skeleton className="h-8 w-24 mb-1.5" />
      <Skeleton className="h-3 w-28" />
    </div>
  )
}

export default function GradesLoading() {
  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6">
      <div className="grid auto-rows-min gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => <TrendCardSkeleton key={i} />)}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <Skeleton className="h-3 w-8 mb-1" />
          <Skeleton className="h-9 w-52" />
        </div>
      </div>

      <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
        <div className="flex gap-4 px-4 py-2.5 bg-stone-50 border-b border-stone-200">
          {['flex-1', 'w-20', 'w-16', 'w-20'].map((w, i) => (
            <Skeleton key={i} className={`h-4 ${w}`} />
          ))}
        </div>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex gap-4 px-4 py-2.5 border-b border-stone-100 last:border-0">
            {['flex-1', 'w-20', 'w-16', 'w-20'].map((w, j) => (
              <Skeleton key={j} className={`h-4 ${w}`} />
            ))}
          </div>
        ))}
        <div className="flex gap-4 px-4 py-2 bg-stone-50 border-t border-stone-100">
          <Skeleton className="h-3 w-48" />
        </div>
      </div>
    </div>
  )
}
