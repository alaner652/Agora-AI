import { create } from 'zustand'
import { getCookie, setCookie, deleteCookie } from '@/lib/cookie'
import { TOKEN_COOKIE } from '@/constants'

/**
 * 唯一的登入/session 來源。
 *
 * token 仍寫進 cookie（SSR 的 serverFetch 需要讀），store 只是它的鏡像 +
 * 提供統一的 logout / sessionExpired，取代過去散在各頁的
 * deleteCookie + router.push('/login')。
 */
interface AuthState {
  token: string | null
  setToken: (token: string) => void
  logout: () => void
  /** token 失效 (AUTH_002) 或上游 session 過期 (NET_002) → 清除並導回登入。 */
  sessionExpired: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  token: getCookie(TOKEN_COOKIE) ?? null,
  setToken: (token) => {
    setCookie(TOKEN_COOKIE, token)
    set({ token })
  },
  logout: () => {
    deleteCookie(TOKEN_COOKIE)
    set({ token: null })
  },
  sessionExpired: () => {
    deleteCookie(TOKEN_COOKIE)
    set({ token: null })
    if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
      window.location.href = '/login'
    }
  },
}))
