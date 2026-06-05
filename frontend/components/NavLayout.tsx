'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import {
  CalendarDays, GraduationCap, Clock, FileText,
  Bot, Settings, LogOut, School, Sun, Moon, Monitor,
} from 'lucide-react'
import { getCookie } from '@/lib/cookie'
import { useAuthStore } from '@/lib/stores/auth'
import { API_BASE_URL as BASE, TOKEN_COOKIE } from '@/constants'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from '@/components/ui/sidebar'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from '@/components/ui/breadcrumb'

const CACHE_KEY = 'tpcu_absence_summary'
const CACHE_TTL = 30 * 60 * 1000  // 30 minutes

function useTruancyCount() {
  const [count, setCount] = useState<number | null>(null)

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(CACHE_KEY)
      if (raw) {
        const { value, ts } = JSON.parse(raw)
        if (Date.now() - ts < CACHE_TTL) { setCount(value); return }
      }
    } catch { /* ignore */ }

    const token = getCookie(TOKEN_COOKIE)
    if (!token) return
    fetch(`${BASE}/api/absence/summary`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data && typeof data.total === 'number') {
          setCount(data.total)
          try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ value: data.total, ts: Date.now() })) } catch { /* ignore */ }
        }
      })
      .catch(() => { /* ignore */ })
  }, [])

  return count
}

const navGroups = [
  {
    label: '學業',
    items: [
      { href: '/schedule', label: '課表',    icon: CalendarDays },
      { href: '/grades',   label: '成績',    icon: GraduationCap },
    ],
  },
  {
    label: '出勤',
    items: [
      { href: '/absence',  label: '缺曠',    icon: Clock,     badge: 'truancy' as const },
      { href: '/leaves',   label: '假單',    icon: FileText },
    ],
  },
  {
    label: '工具',
    items: [
      { href: '/chat',     label: 'Chat',    icon: Bot },
      { href: '/settings', label: '設定',    icon: Settings },
    ],
  },
]

const allNavItems = navGroups.flatMap(g => g.items)

function AppSidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const truancyCount = useTruancyCount()

  function logout() {
    useAuthStore.getState().logout()
    sessionStorage.removeItem('tpcu_chat')
    sessionStorage.removeItem(CACHE_KEY)
    router.push('/login')
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" className="cursor-default hover:bg-transparent active:bg-transparent">
              <div className="flex size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground shrink-0">
                <School className="size-4" />
              </div>
              <div className="flex flex-col gap-0.5 leading-none group-data-[collapsible=icon]:hidden">
                <span className="font-heading font-semibold text-primary text-base">Agora AI</span>
                <span className="text-xs text-muted-foreground">學生入口</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {navGroups.map(group => (
          <SidebarGroup key={group.label} className="pb-2">
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-0.5">
                {group.items.map(({ href, label, icon: Icon, ...rest }) => {
                  const hasBadge = 'badge' in rest && rest.badge === 'truancy'
                  const isActive = pathname === href || pathname.startsWith(href + '/')
                  return (
                    <SidebarMenuItem key={href}>
                      <SidebarMenuButton render={<Link href={href} />} isActive={isActive} tooltip={label}>
                        <Icon />
                        <span className="flex-1">{label}</span>
                        {hasBadge && truancyCount != null && truancyCount > 0 && (
                          <span className="text-[10px] font-bold text-red-400 group-data-[collapsible=icon]:hidden">
                            {truancyCount}
                          </span>
                        )}
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={logout} tooltip="登出">
              <LogOut />
              <span>登出</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  )
}

const THEME_CYCLE = [
  { value: 'system', icon: Monitor, label: '系統' },
  { value: 'light',  icon: Sun,     label: '淺色' },
  { value: 'dark',   icon: Moon,    label: '深色' },
]

function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted) return <div className="w-8 h-8" />

  const idx = Math.max(0, THEME_CYCLE.findIndex(t => t.value === (theme ?? 'system')))
  const current = THEME_CYCLE[idx]
  const next = THEME_CYCLE[(idx + 1) % THEME_CYCLE.length]
  const Icon = current.icon
  return (
    <button
      onClick={() => setTheme(next.value)}
      title={`目前：${current.label} · 點擊切換為${next.label}`}
      className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
    >
      <Icon className="w-4 h-4" />
    </button>
  )
}

export function NavLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const currentLabel = allNavItems.find(
    item => pathname === item.href || pathname.startsWith(item.href + '/')
  )?.label ?? ''

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        {/* 氛圍背景：多層緩慢飄移的柔和品牌光暈（深淺色皆可） */}
        <div aria-hidden className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
          <div className="animate-float-slow absolute -top-40 -right-24 size-120 rounded-full bg-primary/10 blur-[140px]" />
          <div className="animate-float-slow absolute top-1/3 -left-32 size-96 rounded-full bg-primary/[0.07] blur-[130px] [animation-delay:-7s] animation-duration-[24s]" />
          <div className="animate-float-slow absolute -bottom-48 left-1/3 size-136 rounded-full bg-primary/5 blur-[160px] [animation-delay:-14s] animation-duration-[30s]" />
        </div>

        <header className="relative z-10 flex h-12 shrink-0 items-center gap-2 border-b border-border bg-card/70 px-4 backdrop-blur-xl">
          <SidebarTrigger className="-ml-1 text-muted-foreground hover:text-foreground hover:bg-accent" />
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbPage className="font-medium">{currentLabel}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </header>
        <main className="relative z-10 min-w-0 flex-1 overflow-auto">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
