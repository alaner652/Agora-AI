import type { SelectHTMLAttributes } from 'react'

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  className?: string
}

export function Select({ className = '', ...rest }: SelectProps) {
  return (
    <select
      className={`bg-stone-800 border border-stone-700 text-stone-100
        rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400/50
        disabled:opacity-50 ${className}`}
      {...rest}
    />
  )
}
