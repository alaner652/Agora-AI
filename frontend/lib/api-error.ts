/**
 * 後端錯誤的統一解析。
 *
 * 後端慣例：HTTP body 形如 { detail: { error_code, error } }。
 * 這裡把過去散在 api-client / 各頁 useEffect 重複的解析收成一處。
 */

interface ApiErrorShape {
  response?: { data?: { detail?: { error_code?: string; error?: string } | string } }
  message?: string
}

export function getErrorCode(err: unknown): string | undefined {
  const detail = (err as ApiErrorShape)?.response?.data?.detail
  return typeof detail === 'object' ? detail?.error_code : undefined
}

/** token 失效 (AUTH_002) 或上游 session 過期 (NET_002)。 */
export function isAuthError(err: unknown): boolean {
  const code = getErrorCode(err)
  return code === 'AUTH_002' || code === 'NET_002'
}

/** 取出最適合顯示給使用者的訊息。 */
export function errorMessage(err: unknown, fallback = '發生錯誤，請稍後再試'): string {
  const detail = (err as ApiErrorShape)?.response?.data?.detail
  if (typeof detail === 'object' && detail && typeof detail.error === 'string') return detail.error
  if (typeof detail === 'string') return detail
  return (err as ApiErrorShape)?.message ?? fallback
}
