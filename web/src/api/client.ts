import axios from 'axios'

const BASE = ''  // Vite proxy handles /api, /login, /chat, /answer

export const http = axios.create({ baseURL: BASE })

http.interceptors.request.use((config) => {
  const token = localStorage.getItem('tpcu_token')
  if (token && config.headers) {
    config.headers['Authorization'] = `Bearer ${token}`
  }
  return config
})

export interface ApiError {
  error: string
  error_code: string
}

export function isApiError(detail: unknown): detail is ApiError {
  return typeof detail === 'object' && detail !== null && 'error_code' in detail
}
