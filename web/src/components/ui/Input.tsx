import type { InputHTMLAttributes } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  className?: string
}

export function Input({ className = '', ...rest }: InputProps) {
  return (
    <input
      className={`w-full bg-stone-800 border border-stone-700 text-stone-100 placeholder:text-stone-500
        rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400/50
        disabled:opacity-50 ${className}`}
      {...rest}
    />
  )
}
