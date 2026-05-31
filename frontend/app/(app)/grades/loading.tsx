import { Skeleton } from '@/components/ui/skeleton'

export default function GradesLoading() {
  return (
    <div className="p-4 sm:p-6">
      <Skeleton className="h-7 w-16 mb-6" />
      {Array.from({ length: 3 }).map((_, g) => (
        <div key={g} className="mb-8">
          <Skeleton className="h-5 w-32 mb-3" />
          <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
            <div className="p-3 border-b border-stone-100 flex gap-4">
              {['flex-1', 'w-20', 'w-16', 'w-16'].map((w, i) => (
                <Skeleton key={i} className={`h-4 ${w}`} />
              ))}
            </div>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="p-3 border-b border-stone-100 last:border-0 flex gap-4">
                {['flex-1', 'w-20', 'w-16', 'w-16'].map((w, j) => (
                  <Skeleton key={j} className={`h-4 ${w}`} />
                ))}
              </div>
            ))}
            <div className="p-3 bg-stone-50 flex gap-4">
              <Skeleton className="h-4 flex-1" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
