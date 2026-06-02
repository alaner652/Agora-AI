import axios from 'axios'
import { getCookie, deleteCookie } from './cookie'

export const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000',
})

apiClient.interceptors.request.use(cfg => {
  const token = getCookie('token')
  if (token) cfg.headers.Authorization = `Bearer ${token}`
  return cfg
})

apiClient.interceptors.response.use(
  res => res,
  err => {
    const code = (err as { response?: { data?: { detail?: { error_code?: string } } } })
      ?.response?.data?.detail?.error_code
    if (code === 'AUTH_002' || code === 'NET_002') {
      deleteCookie('token')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)
