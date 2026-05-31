import type { InputHTMLAttributes } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  className?: string
}

export function Input({ className = '', ...rest }: InputProps) {
  return (
    <input
      className={`w-full bg-white border border-stone-300 text-stone-900 placeholder:text-stone-400
        rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400/50
        disabled:opacity-50 disabled:bg-stone-50 ${className}`}
      {...rest}
    />
  )
}
