import type { InputHTMLAttributes } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  className?: string
}

export function Input({ className = '', ...rest }: InputProps) {
  return (
    <input
      className={`w-full bg-zinc-800 border border-zinc-700 text-zinc-100 placeholder:text-zinc-500
        rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500
        disabled:opacity-50 ${className}`}
      {...rest}
    />
  )
}
