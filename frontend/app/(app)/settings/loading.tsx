import { Skeleton } from '@/components/ui/skeleton'

export default function SettingsLoading() {
  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6">
      {/* Config status */}
      <Skeleton className="h-5 w-36 rounded-full" />

      {/* Provider selector */}
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-24 rounded-lg" />
        ))}
      </div>

      {/* Base URL */}
      <div>
        <Skeleton className="h-3 w-16 mb-1.5" />
        <Skeleton className="h-9 w-full rounded-lg" />
      </div>

      {/* API Key */}
      <div>
        <Skeleton className="h-3 w-16 mb-1.5" />
        <Skeleton className="h-9 w-full rounded-lg" />
      </div>

      {/* Model */}
      <div>
        <Skeleton className="h-3 w-12 mb-1.5" />
        <div className="flex gap-2">
          <Skeleton className="h-9 flex-1 rounded-lg" />
          <Skeleton className="h-9 w-20 rounded-lg" />
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 pt-2">
        <Skeleton className="h-8 w-20 rounded-lg" />
        <Skeleton className="h-8 w-20 rounded-lg" />
        <Skeleton className="h-8 w-20 rounded-lg" />
      </div>
    </div>
  )
}
