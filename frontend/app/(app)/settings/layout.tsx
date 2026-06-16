'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'
import { LayoutDashboard, Bot, Palette, Settings2 } from 'lucide-react'

const NAV_ITEMS = [
  { href: '/settings/general',    label: '總覽',    icon: LayoutDashboard },
  { href: '/settings/llm',        label: 'AI 模型', icon: Bot },
  { href: '/settings/appearance', label: '外觀',    icon: Palette },
  { href: '/settings/advanced',   label: '進階',    icon: Settings2 },
]

export default function SettingsLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="flex h-full">
      <nav className="w-44 shrink-0 border-r border-border p-3 space-y-0.5">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link key={href} href={href}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                active
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
              }`}>
              <Icon className="size-4 shrink-0" />
              {label}
            </Link>
          )
        })}
      </nav>

      <div className="flex-1 overflow-y-auto scrollbar-gutter-stable min-w-0">
        <div className="px-6 py-6 max-w-lg space-y-5">
          {children}
        </div>
      </div>
    </div>
  )
}
