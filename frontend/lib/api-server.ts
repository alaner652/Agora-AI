import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { API_BASE_URL, TOKEN_COOKIE } from '@/constants'

// Server component 跑在前端容器內，優先走容器內網（runtime 環境變數，不烘進 client bundle）。
// 未設定時退回 API_BASE_URL（= NEXT_PUBLIC_API_URL，本機開發即 localhost:8000）。
const SERVER_API_URL = process.env.API_INTERNAL_URL ?? API_BASE_URL

export async function serverFetch<T = unknown>(path: string): Promise<T> {
  const store = await cookies()
  const token = store.get(TOKEN_COOKIE)?.value
  const res = await fetch(`${SERVER_API_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    cache: 'no-store',
  })
  if (!res.ok) {
    // 401 = token 失效 (AUTH_002) 或上游 session 過期 (NET_002) → 一律導回登入。
    // 注意：redirect() 以丟例外實作，呼叫端的 try/catch 需用 unstable_rethrow 放行。
    if (res.status === 401) redirect('/login')
    const body = await res.json().catch(() => null)
    const message =
      (typeof body?.detail?.error === 'string' && body.detail.error) ||
      (body ? JSON.stringify(body) : res.statusText)
    throw new Error(message)
  }
  return res.json() as Promise<T>
}
