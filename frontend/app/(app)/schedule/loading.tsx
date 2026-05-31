import { Skeleton } from '@/components/ui/skeleton'

export default function ScheduleLoading() {
  return (
    <div className="p-4 sm:p-6">
      <Skeleton className="h-7 w-24 mb-6" />
      <div className="flex gap-3 mb-6">
        <Skeleton className="h-9 w-36" />
      </div>
      <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
        <div className="p-3 border-b border-stone-100 flex gap-4">
          <Skeleton className="h-4 w-8" />
          {Array.from({ length: 7 }).map((_, i) => <Skeleton key={i} className="h-4 flex-1" />)}
        </div>
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="p-3 border-b border-stone-100 last:border-0 flex gap-4">
            <Skeleton className="h-4 w-8 shrink-0" />
            {Array.from({ length: 7 }).map((_, j) => <Skeleton key={j} className="h-12 flex-1" />)}
          </div>
        ))}
      </div>
    </div>
  )
}
