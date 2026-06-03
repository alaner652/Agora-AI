import axios from 'axios'
import { getCookie } from './cookie'
import { isAuthError } from './api-error'
import { useAuthStore } from './stores/auth'
import { API_BASE_URL, TOKEN_COOKIE } from '@/constants'

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
})

apiClient.interceptors.request.use(cfg => {
  const token = getCookie(TOKEN_COOKIE)
  if (token) cfg.headers.Authorization = `Bearer ${token}`
  return cfg
})

// 直接呼叫 apiClient（未經 react-query）時的 auth 安全網；
// 經 react-query 的錯誤統一由 providers 的 onError 處理。
apiClient.interceptors.response.use(
  res => res,
  err => {
    if (isAuthError(err)) useAuthStore.getState().sessionExpired()
    return Promise.reject(err)
  }
)
