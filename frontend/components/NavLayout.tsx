'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  CalendarDays, GraduationCap, Clock, FileText,
  Bot, Settings, LogOut, School,
} from 'lucide-react'
import { deleteCookie } from '@/lib/cookie'
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
      { href: '/absence',  label: '缺曠',    icon: Clock },
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

  function logout() {
    deleteCookie('token')
    sessionStorage.removeItem('tpcu_chat')
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
                <span className="font-semibold text-indigo-500 text-sm">TPCU.me</span>
                <span className="text-xs text-muted-foreground">學生入口</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {navGroups.map(group => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map(({ href, label, icon: Icon }) => {
                  const isActive = pathname === href || pathname.startsWith(href + '/')
                  return (
                    <SidebarMenuItem key={href}>
                      <SidebarMenuButton render={<Link href={href} />} isActive={isActive} tooltip={label}>
                        <Icon />
                        <span>{label}</span>
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

export function NavLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const currentLabel = allNavItems.find(
    item => pathname === item.href || pathname.startsWith(item.href + '/')
  )?.label ?? ''

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-stone-200 bg-white px-4">
          <SidebarTrigger className="-ml-1 text-stone-500 hover:text-stone-700 hover:bg-stone-100" />
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbPage className="font-medium">{currentLabel}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </header>
        <main className="flex-1 overflow-auto bg-stone-50">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
