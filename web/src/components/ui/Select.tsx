import type { SelectHTMLAttributes } from 'react'

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  className?: string
}

export function Select({ className = '', ...rest }: SelectProps) {
  return (
    <select
      className={`bg-white border border-stone-300 text-stone-900
        rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400/50
        disabled:opacity-50 ${className}`}
      {...rest}
    />
  )
}
