import type { UsageData } from '@/types/chat'

interface TokenBadgeProps {
  usage: UsageData
}

function fmt(n: number) {
  return n.toLocaleString()
}

function fmtCost(usd: number) {
  if (usd === 0) return '$0'
  if (usd < 0.001) return `$${(usd * 1000).toFixed(3)}m`
  return `$${usd.toFixed(4)}`
}

export default function TokenBadge({ usage }: TokenBadgeProps) {
  const { inputTokens, outputTokens, cachedTokens, costUsd } = usage
  return (
    <div className="flex items-center gap-2 mt-2 flex-wrap">
      <span className="inline-flex items-center gap-1.5 text-[10px] text-stone-400 bg-stone-50 border border-stone-200 rounded-full px-2 py-0.5">
        <span className="text-stone-500">in</span>
        <span className="text-stone-600">{fmt(inputTokens)}</span>
        <span className="text-stone-300">·</span>
        <span className="text-stone-500">out</span>
        <span className="text-stone-600">{fmt(outputTokens)}</span>
        {cachedTokens > 0 && (
          <>
            <span className="text-stone-300">·</span>
            <span className="text-stone-500">cached</span>
            <span className="text-emerald-600">{fmt(cachedTokens)}</span>
          </>
        )}
        <span className="text-stone-300">·</span>
        <span className="text-indigo-500">{fmtCost(costUsd)}</span>
      </span>
    </div>
  )
}
