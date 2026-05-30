interface BadgeProps {
  label: string
  className?: string
}

function statusCls(label: string): string {
  if (label === '已核准' || label === '核准') return 'text-emerald-400 bg-emerald-400/10'
  if (['待審核', '送出', '待核准', '待審'].includes(label)) return 'text-amber-400 bg-amber-400/10'
  if (label === '退件' || label === '不核准') return 'text-red-400 bg-red-400/10'
  if (label === '作廢' || label === '已刪除') return 'text-stone-500 bg-stone-700 line-through'
  return 'text-stone-400 bg-stone-700'
}

export function StatusBadge({ label, className = '' }: BadgeProps) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusCls(label)} ${className}`}>
      {label || '—'}
    </span>
  )
}
