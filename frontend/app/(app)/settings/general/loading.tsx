import { Skeleton } from '@/components/ui/skeleton'
import { SettingCard } from '@/components/settings/primitives'

function InfoRowSkeleton({ valueW }: { valueW: string }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-border/60 last:border-0">
      <Skeleton className="h-3 w-16" />
      <Skeleton className={`h-3.5 ${valueW}`} />
    </div>
  )
}

export default function GeneralSettingsLoading() {
  return (
    <>
      <SettingCard>
        <Skeleton className="h-4 w-12" />
        <div className="-mt-2">
          <InfoRowSkeleton valueW="w-24" />
        </div>
      </SettingCard>

      <SettingCard>
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-3 w-10" />
        </div>
        <div className="-mt-2">
          <InfoRowSkeleton valueW="w-20" />
        </div>
      </SettingCard>

      <SettingCard>
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-3 w-10" />
        </div>
        <div className="-mt-2">
          {['w-24', 'w-20', 'w-28'].map((w, i) => (
            <InfoRowSkeleton key={i} valueW={w} />
          ))}
        </div>
        <div className="space-y-2 pt-1">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex items-center gap-2">
              <Skeleton className="h-3 w-10" />
              <Skeleton className="h-1.5 flex-1 rounded-full" />
              <Skeleton className="h-3 w-14" />
            </div>
          ))}
        </div>
      </SettingCard>
    </>
  )
}
