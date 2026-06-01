'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'

const NAV_ITEMS = [
  { href: '/settings/general',     label: 'General' },
  { href: '/settings/llm',         label: 'LLM' },
  { href: '/settings/appearance',  label: 'Appearance' },
  { href: '/settings/advanced',    label: 'Advanced' },
]

export default function SettingsLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6 h-full">
      <h1 className="text-lg font-semibold text-foreground">設定</h1>
      <div className="flex gap-6 flex-1 min-h-0">
        {/* Sidebar */}
        <nav className="w-36 shrink-0 space-y-0.5">
          {NAV_ITEMS.map(({ href, label }) => {
            const active = pathname === href || pathname.startsWith(href + '/')
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors
                  ${active
                    ? 'bg-accent text-primary font-medium border-l-2 border-primary'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                  }`}
              >
                {label}
              </Link>
            )
          })}
        </nav>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {children}
        </div>
      </div>
    </div>
  )
}
