import { Skeleton } from '@/components/ui/skeleton'
import { SettingCard } from '@/components/settings/primitives'

export default function LLMSettingsLoading() {
  return (
    <>
      {/* ── Card 1: Provider ── */}
      <SettingCard>
        {/* Header：title + status */}
        <div className="flex items-start justify-between gap-2">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-3 w-24" />
        </div>

        {/* Provider pills */}
        <div className="flex flex-wrap gap-1.5">
          {['w-16', 'w-20', 'w-14', 'w-24', 'w-16'].map((w, i) => (
            <Skeleton key={i} className={`h-7 ${w} rounded-full`} />
          ))}
        </div>

        {/* Model selector */}
        <div className="space-y-2">
          <Skeleton className="h-3 w-8" />
          <div className="grid grid-cols-2 gap-1.5">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-9 rounded-lg" />)}
          </div>
          <Skeleton className="h-9 w-full rounded-lg" />
        </div>

        {/* API Key */}
        <div className="space-y-1.5">
          <Skeleton className="h-3 w-14" />
          <Skeleton className="h-9 w-full rounded-lg" />
        </div>

        {/* Base URL */}
        <div className="space-y-1.5">
          <Skeleton className="h-3 w-14" />
          <Skeleton className="h-9 w-full rounded-lg" />
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 pt-1">
          <Skeleton className="h-8 w-20 rounded-lg" />
          <Skeleton className="h-8 w-16 rounded-lg" />
        </div>
        <Skeleton className="h-2.5 w-44" />
      </SettingCard>

      {/* ── Card 2: Behaviour ── */}
      <SettingCard>
        <Skeleton className="h-4 w-16" />

        {/* Sliders */}
        {[...Array(3)].map((_, i) => (
          <div key={i} className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-3 w-10" />
            </div>
            <Skeleton className="h-1 w-full rounded-full" />
          </div>
        ))}

        {/* System Prompt */}
        <div className="space-y-1.5">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-20 w-full rounded-lg" />
        </div>

        <Skeleton className="h-8 w-16 rounded-lg" />
      </SettingCard>
    </>
  )
}
