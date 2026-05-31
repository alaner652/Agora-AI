interface BadgeProps {
  label: string
  className?: string
}

function statusCls(label: string): string {
  if (label === '已核准' || label === '核准') return 'text-emerald-700 bg-emerald-50'
  if (['待審核', '送出', '待核准', '待審'].includes(label)) return 'text-amber-700 bg-amber-50'
  if (label === '退件' || label === '不核准') return 'text-red-600 bg-red-50'
  if (label === '作廢' || label === '已刪除') return 'text-stone-400 bg-stone-100 line-through'
  return 'text-stone-500 bg-stone-100'
}

export function StatusBadge({ label, className = '' }: BadgeProps) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusCls(label)} ${className}`}>
      {label || '—'}
    </span>
  )
}
