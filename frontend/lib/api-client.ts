import axios from 'axios'
import { getCookie } from './cookie'
import { isAuthError } from './api-error'
import { useAuthStore } from './stores/auth'

export const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000',
})

apiClient.interceptors.request.use(cfg => {
  const token = getCookie('token')
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
