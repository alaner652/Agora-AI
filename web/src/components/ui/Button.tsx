import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Spinner } from './Spinner'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md'
  loading?: boolean
  children: ReactNode
}

const variantCls: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary:   'bg-orange-500 hover:bg-orange-600 text-white disabled:opacity-40',
  secondary: 'bg-white border border-stone-300 text-stone-700 hover:bg-stone-50 disabled:opacity-40',
  ghost:     'text-stone-500 hover:text-stone-800 hover:bg-stone-100 disabled:opacity-40',
  danger:    'text-red-500 hover:text-red-600 hover:bg-red-50 disabled:opacity-40',
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
