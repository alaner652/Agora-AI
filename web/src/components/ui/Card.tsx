import type { ReactNode } from 'react'

interface CardProps {
  children: ReactNode
  className?: string
}

export function Card({ children, className = '' }: CardProps) {
  return (
    <div className={`bg-zinc-900 rounded-xl border border-zinc-800 ${className}`}>
      {children}
    </div>
  )
}
