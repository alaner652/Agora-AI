import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { login, saveToken } from '../api/auth'

export default function LoginPage() {
  const [uid, setUid] = useState('')
  const [pwd, setPwd] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const token = await login(uid, pwd)
      saveToken(token)
      navigate('/schedule')
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: { error?: string } | string } } })
        ?.response?.data?.detail
      if (typeof detail === 'object' && detail !== null && 'error' in detail) {
        setError(String((detail as { error: string }).error))
      } else if (typeof detail === 'string') {
        setError(detail)
      } else {
        setError('登入失敗，請確認學號密碼')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold text-gray-900">TPCU.me</h1>
          <p className="text-sm text-gray-500 mt-1">台北城市科技大學學生入口</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">學號</label>
            <input
              type="text"
              value={uid}
              onChange={(e) => setUid(e.target.value)}
              placeholder="e.g. B1234567"
              required
              autoFocus
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">密碼</label>
            <input
              type="password"
              value={pwd}
              onChange={(e) => setPwd(e.target.value)}
              required
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white rounded-lg py-2 text-sm font-medium transition-colors"
          >
            {loading ? '登入中...' : '登入'}
          </button>
        </form>

        <p className="text-xs text-gray-400 text-center mt-6">
          密碼僅用於取得學校 Session，不儲存在伺服器
        </p>
      </div>
    </div>
  )
}
