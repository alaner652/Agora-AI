import type { ReactNode } from 'react'

interface PageShellProps {
  title: string
  action?: ReactNode
  children: ReactNode
}

export function PageShell({ title, action, children }: PageShellProps) {
  return (
    <div className="p-4 sm:p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-zinc-100">{title}</h1>
        {action && <div>{action}</div>}
      </div>
      {children}
    </div>
  )
}
