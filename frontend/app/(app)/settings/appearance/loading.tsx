import { Skeleton } from '@/components/ui/skeleton'

export default function AppearanceSettingsLoading() {
  return (
    <>
      {/* Theme */}
      <div className="rounded-xl border border-border bg-card/70 p-4 space-y-4 backdrop-blur-xl">
        <div className="space-y-1.5">
          <Skeleton className="h-4 w-12" />
          <Skeleton className="h-2.5 w-40" />
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="flex flex-col items-center gap-2 py-4 rounded-lg border border-border">
              <Skeleton className="h-5 w-5 rounded" />
              <Skeleton className="h-3 w-8" />
            </div>
          ))}
        </div>
      </div>

      {/* Brand colour */}
      <div className="rounded-xl border border-border bg-card/70 p-4 space-y-4 backdrop-blur-xl">
        <div className="space-y-1.5">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-2.5 w-56" />
        </div>

        {/* Preset swatches */}
        <div className="flex flex-wrap gap-2.5">
          {[...Array(8)].map((_, i) => <Skeleton key={i} className="w-8 h-8 rounded-full" />)}
        </div>

        {/* Custom hex */}
        <div className="flex items-center gap-2">
          <Skeleton className="w-8 h-8 rounded-lg shrink-0" />
          <Skeleton className="h-9 flex-1 rounded-lg" />
          <Skeleton className="h-9 w-14 rounded-lg" />
        </div>
      </div>
    </>
  )
}
