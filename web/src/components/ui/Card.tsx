import type { ReactNode } from 'react'

interface CardProps {
  children: ReactNode
  className?: string
}

export function Card({ children, className = '' }: CardProps) {
  return (
    <div className={`bg-white border border-stone-200 rounded-xl ${className}`}>
      {children}
    </div>
  )
}
