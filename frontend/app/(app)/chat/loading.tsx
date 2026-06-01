import { Skeleton } from '@/components/ui/skeleton'

export default function ChatLoading() {
  return (
    <div className="flex flex-col h-[calc(100dvh-3.5rem)]">
      {/* Messages area - empty state skeleton */}
      <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6">
        <Skeleton className="w-12 h-12 rounded-full" />
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-4 w-64" />
        <div className="grid grid-cols-2 gap-2 w-full max-w-md mt-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-14 rounded-xl" />
          ))}
        </div>
      </div>

      {/* Input area skeleton */}
      <div className="border-t border-stone-100 p-3 flex gap-2 items-end">
        <Skeleton className="h-9 w-9 shrink-0 rounded-lg" />
        <Skeleton className="h-9 flex-1 rounded-lg" />
        <Skeleton className="h-9 w-9 shrink-0 rounded-lg" />
      </div>
    </div>
  )
}
