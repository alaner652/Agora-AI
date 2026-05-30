import { http } from './client'

export async function login(uid: string, pwd: string): Promise<string> {
  const res = await http.post<{ token: string }>('/login', { uid, pwd })
  return res.data.token
}

export function saveToken(token: string) {
  localStorage.setItem('tpcu_token', token)
}

export function getToken(): string | null {
  return localStorage.getItem('tpcu_token')
}

export function clearToken() {
  localStorage.removeItem('tpcu_token')
}
