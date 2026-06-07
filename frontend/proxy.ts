import { NextRequest, NextResponse } from 'next/server'

export function proxy(req: NextRequest) {
  const token = req.cookies.get('token')?.value
  const { pathname } = req.nextUrl
  // 公開路徑：登入頁與品牌落地頁（根路由）。其餘無 token 一律導回 /login。
  // 已登入者進 `/` 會由 app/page.tsx 再導去 /schedule。
  const isPublic = pathname === '/' || pathname.startsWith('/login')
  if (!token && !isPublic) {
    return NextResponse.redirect(new URL('/login', req.url))
  }
}

export const config = {
  matcher: ['/((?!_next|favicon.ico).*)'],
}
