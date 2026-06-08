'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useTheme } from 'next-themes'
import { GraduationCap, LayoutDashboard, Monitor, Moon, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/lib/stores/auth'
import { cn } from '@/lib/utils'

/**
 * 落地頁頂部導覽列:固定浮動、感知登入狀態。
 *
 * 頂端時透明融入 Hero,捲動後浮現底色 + 邊框 + 模糊。
 * 右側:深淺色切換 + (未登入 → 登入 / 已登入 → 儀表板)。
 * 主題切換與 auth 區皆以 mounted 旗標延後渲染,避免 cookie / next-themes
 * 來源造成的 SSR/CSR 不一致。
 */

const THEME_CYCLE = [
  { value: 'system', icon: Monitor, label: '系統' },
  { value: 'light', icon: Sun, label: '淺色' },
  { value: 'dark', icon: Moon, label: '深色' },
]

export function LandingNav() {
  const [scrolled, setScrolled] = useState(false)
  const [mounted, setMounted] = useState(false)
  const token = useAuthStore((s) => s.token)
  const { theme, setTheme } = useTheme()

  useEffect(() => {
    setMounted(true)
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const linkCls =
    'hidden rounded-lg px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground sm:inline-block'

  const themeIdx = Math.max(0, THEME_CYCLE.findIndex((t) => t.value === (theme ?? 'system')))
  const themeCur = THEME_CYCLE[themeIdx]
  const themeNext = THEME_CYCLE[(themeIdx + 1) % THEME_CYCLE.length]
  const ThemeIcon = themeCur.icon

  return (
    <header
      className={cn(
        'fixed inset-x-0 top-0 z-50 transition-colors duration-300',
        scrolled
          ? 'border-b border-border/60 bg-background/80 backdrop-blur-md'
          : 'border-b border-transparent bg-transparent',
      )}
    >
      <nav className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-6">
        <Link href="/" aria-label="Agora AI 首頁" className="inline-flex items-center gap-2">
          <GraduationCap className="size-5 text-primary" />
          <span className="font-heading text-base font-semibold text-primary">Agora AI</span>
        </Link>

        <div className="flex items-center gap-1 sm:gap-2">
          <Link href="#features" className={linkCls}>功能</Link>
          <Link href="#preview" className={linkCls}>展示</Link>
          <Link href="#pricing" className={linkCls}>定價</Link>
          <Link href="#faq" className={linkCls}>常見問題</Link>

          {/* 深淺色切換(系統 → 淺 → 深 循環),mounted 後才渲染 */}
          {mounted && (
            <button
              onClick={() => setTheme(themeNext.value)}
              aria-label={`切換主題,目前:${themeCur.label}`}
              title={`目前:${themeCur.label} · 點擊切換為${themeNext.label}`}
              className="flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <ThemeIcon className="size-4" />
            </button>
          )}

          {/* auth 區:mounted 後才渲染,避免 hydration mismatch */}
          {mounted &&
            (token ? (
              <Button
                render={<Link href="/schedule" />}
                nativeButton={false}
                className="h-9 gap-1.5 px-4 text-sm"
              >
                <LayoutDashboard className="size-4" />
                儀表板
              </Button>
            ) : (
              <Button
                render={<Link href="/login" />}
                nativeButton={false}
                className="h-9 px-4 text-sm"
              >
                登入
              </Button>
            ))}
        </div>
      </nav>
    </header>
  )
}
