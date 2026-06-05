import { Skeleton } from '@/components/ui/skeleton'
import { SettingCard } from '@/components/settings/primitives'

export default function AdvancedSettingsLoading() {
  return (
    <SettingCard>
      <Skeleton className="h-4 w-16" />
      <div className="-mt-1">
        {[...Array(2)].map((_, i) => (
          <div key={i} className="flex items-start justify-between gap-4 py-3 border-b border-border/60 last:border-0">
            <div className="flex-1 min-w-0 space-y-1.5">
              <Skeleton className="h-3.5 w-28" />
              <Skeleton className="h-2.5 w-56" />
            </div>
            <Skeleton className="h-7 w-14 rounded-lg shrink-0" />
          </div>
        ))}
      </div>
    </SettingCard>
  )
}
