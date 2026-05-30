import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Spinner } from './Spinner'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md'
  loading?: boolean
  children: ReactNode
}

const variantCls: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary:   'bg-orange-400 hover:bg-orange-500 text-white disabled:opacity-40',
  secondary: 'bg-stone-800 border border-stone-700 text-stone-300 hover:bg-stone-700 disabled:opacity-40',
  ghost:     'text-stone-400 hover:text-stone-100 hover:bg-stone-800 disabled:opacity-40',
  danger:    'text-red-400 hover:text-red-300 hover:bg-red-500/10 disabled:opacity-40',
}

const sizeCls: Record<NonNullable<ButtonProps['size']>, string> = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  className = '',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      className={`inline-flex items-center gap-1.5 rounded-lg font-medium transition-colors cursor-pointer
        ${variantCls[variant]} ${sizeCls[size]} ${className}`}
      {...rest}
    >
      {loading && <Spinner className="w-3.5 h-3.5" />}
      {children}
    </button>
  )
}
