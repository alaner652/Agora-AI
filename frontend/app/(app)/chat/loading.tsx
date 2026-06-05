import { Skeleton } from '@/components/ui/skeleton'

export default function ChatLoading() {
  return (
    <div className="flex flex-col h-[calc(100dvh-3rem)]">
      {/* Messages area */}
      <div className="flex-1 overflow-hidden">
        <div className="py-6 px-4 md:px-6 space-y-6 max-w-3xl mx-auto">
          {/* Assistant bubble */}
          <div className="flex gap-3 justify-start">
            <Skeleton className="w-7 h-7 rounded-full shrink-0" />
            <div className="flex-1 space-y-2 pt-0.5">
              <Skeleton className="h-3.5 w-3/4" />
              <Skeleton className="h-3.5 w-1/2" />
            </div>
          </div>

          {/* User bubble */}
          <div className="flex gap-3 justify-end">
            <Skeleton className="h-10 w-48 rounded-2xl rounded-tr-sm" />
          </div>

          {/* Assistant bubble */}
          <div className="flex gap-3 justify-start">
            <Skeleton className="w-7 h-7 rounded-full shrink-0" />
            <div className="flex-1 space-y-2 pt-0.5">
              <Skeleton className="h-3.5 w-5/6" />
              <Skeleton className="h-3.5 w-2/3" />
              <Skeleton className="h-3.5 w-1/3" />
            </div>
          </div>
        </div>
      </div>

      {/* Input area */}
      <div className="shrink-0 border-t border-border bg-card/70 backdrop-blur-xl">
        <div className="max-w-3xl mx-auto px-4 py-3">
          <div className="flex gap-2 items-end">
            <Skeleton className="h-9 w-9 rounded-lg shrink-0" />
            <Skeleton className="h-9 w-9 rounded-lg shrink-0" />
            <Skeleton className="h-9 flex-1 rounded-lg" />
            <Skeleton className="h-9 w-9 rounded-lg shrink-0" />
          </div>
          <div className="flex justify-center mt-1.5">
            <Skeleton className="h-2.5 w-48" />
          </div>
        </div>
      </div>
    </div>
  )
}
