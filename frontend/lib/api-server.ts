import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { API_BASE_URL, TOKEN_COOKIE } from '@/constants'

export async function serverFetch<T = unknown>(path: string): Promise<T> {
  const store = await cookies()
  const token = store.get(TOKEN_COOKIE)?.value
  const res = await fetch(`${API_BASE_URL}${path}`, {
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
