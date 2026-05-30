import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { login, saveToken } from '../api/auth'
import { Button } from '../components/ui'

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
    <div className="min-h-screen flex items-center justify-center bg-zinc-950">
      <div className="w-full max-w-sm bg-zinc-900 rounded-2xl border border-zinc-800 p-8">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-orange-500 tracking-wide">TPCU.me</h1>
          <p className="text-sm text-zinc-500 mt-1">台北城市科技大學學生入口</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1">學號</label>
            <input
              type="text"
              value={uid}
              onChange={e => setUid(e.target.value)}
              placeholder="e.g. B1234567"
              required
              autoFocus
              className="w-full bg-zinc-800 border border-zinc-700 text-zinc-100 placeholder:text-zinc-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1">密碼</label>
            <input
              type="password"
              value={pwd}
              onChange={e => setPwd(e.target.value)}
              required
              className="w-full bg-zinc-800 border border-zinc-700 text-zinc-100 placeholder:text-zinc-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>

          {error && (
            <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <Button type="submit" loading={loading} className="w-full justify-center py-2">
            {loading ? '登入中...' : '登入'}
          </Button>
        </form>

        <p className="text-xs text-zinc-600 text-center mt-6">
          密碼僅用於取得學校 Session，不儲存在伺服器
        </p>
      </div>
    </div>
  )
}
