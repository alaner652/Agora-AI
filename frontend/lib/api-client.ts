import { getCookie } from './cookie'
import { isAuthError } from './api-error'
import { useAuthStore } from './stores/auth'
import { API_BASE_URL, TOKEN_COOKIE } from '@/constants'

function authHeaders(): Record<string, string> {
  const token = getCookie(TOKEN_COOKIE)
  return token ? { Authorization: `Bearer ${token}` } : {}
}

async function request<T>(
  method: string,
  path: string,
  options: { params?: Record<string, string>; body?: unknown } = {},
): Promise<{ data: T }> {
  let url = `${API_BASE_URL}${path}`
  if (options.params) {
    const qs = new URLSearchParams(options.params).toString()
    if (qs) url += `?${qs}`
  }

  const res = await fetch(url, {
    method,
    headers: {
      ...authHeaders(),
      ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  })

  const ct = res.headers.get('content-type') ?? ''
  const data = ct.includes('application/json') ? await res.json() : await res.text()

  if (!res.ok) {
    const err = Object.assign(new Error(res.statusText), { response: { data } })
    if (isAuthError(err)) useAuthStore.getState().sessionExpired()
    throw err
  }

  return { data: data as T }
}

export const apiClient = {
  get:    <T>(path: string, opts?: { params?: Record<string, string> }) =>
            request<T>('GET', path, opts),
  post:   <T>(path: string, body?: unknown) =>
            request<T>('POST', path, { body }),
  put:    <T>(path: string, body?: unknown) =>
            request<T>('PUT', path, { body }),
  patch:  <T>(path: string, body?: unknown) =>
            request<T>('PATCH', path, { body }),
  delete: <T = void>(path: string) =>
            request<T>('DELETE', path),
}
