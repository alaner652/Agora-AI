import type { ProviderInfo } from '@/types/chat'

interface ProviderBadgeProps {
  info: ProviderInfo | null
}

export default function ProviderBadge({ info }: ProviderBadgeProps) {
  if (!info) {
    return (
      <div className="h-5 w-28 rounded-full bg-stone-200 animate-pulse" />
    )
  }

  const { model, isLocal } = info
  const label = model.length > 20 ? model.slice(0, 18) + '…' : model

  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[10px] font-medium rounded-full px-2.5 py-1 border ${
        isLocal
          ? 'bg-amber-900/20 border-amber-700/40 text-amber-400'
          : 'bg-indigo-50 border-indigo-200 text-indigo-600'
      }`}
      title={model}
    >
      {isLocal ? '⚡' : '☁'} {isLocal ? 'Local' : 'Cloud'}
      <span className="text-stone-300 mx-0.5">·</span>
      <span className="opacity-70">{label}</span>
    </span>
  )
}
