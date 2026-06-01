'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'

const NAV_ITEMS = [
  { href: '/settings/general',    label: 'General' },
  { href: '/settings/llm',        label: 'LLM' },
  { href: '/settings/appearance', label: 'Appearance' },
  { href: '/settings/advanced',   label: 'Advanced' },
]

export default function SettingsLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="flex h-full">
      <nav className="w-44 shrink-0 border-r border-border p-4 space-y-1">
        {NAV_ITEMS.map(({ href, label }) => {
          const active = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link key={href} href={href}
              className={`block px-3 py-2 rounded-lg text-sm transition-colors ${
                active
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
              }`}>
              {label}
            </Link>
          )
        })}
      </nav>

      <div className="flex-1 overflow-y-auto min-w-0">
        <div className="p-6 max-w-lg space-y-5">
          {children}
        </div>
      </div>
    </div>
  )
}
