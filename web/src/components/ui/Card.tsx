import type { ReactNode } from 'react'

interface CardProps {
  children: ReactNode
  className?: string
}

export function Card({ children, className = '' }: CardProps) {
  return (
    <div className={`bg-stone-800 border border-stone-700 rounded-xl ${className}`}>
      {children}
    </div>
  )
}
