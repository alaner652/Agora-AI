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
      {/* 帳號 */}
      <SettingCard>
        <Skeleton className="h-4 w-12" />
        <div className="-mt-2">
          <InfoRowSkeleton valueW="w-24" />
        </div>
      </SettingCard>

      {/* 語言模型 */}
      <SettingCard>
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-3 w-10" />
        </div>
        <div className="-mt-2">
          {['w-16', 'w-32', 'w-28', 'w-8', 'w-12', 'w-10'].map((w, i) => (
            <InfoRowSkeleton key={i} valueW={w} />
          ))}
        </div>
      </SettingCard>
    </>
  )
}
