import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { login, saveToken } from '../api/auth'
import { Button, Input } from '../components/ui'

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
    <div className="min-h-screen flex items-center justify-center px-4 bg-[#1c1917]">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold text-orange-400 tracking-wide">TPCU.me</h1>
          <p className="text-sm text-stone-500 mt-1">台北城市科技大學學生入口</p>
        </div>

        <div className="bg-stone-800 border border-stone-700 rounded-xl p-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-stone-300 mb-1.5">學號</label>
              <Input
                type="text"
                value={uid}
                onChange={e => setUid(e.target.value)}
                placeholder="e.g. B1234567"
                required
                autoFocus
                className="py-2"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-stone-300 mb-1.5">密碼</label>
              <Input
                type="password"
                value={pwd}
                onChange={e => setPwd(e.target.value)}
                required
                className="py-2"
              />
            </div>

            {error && (
              <p className="text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <Button type="submit" loading={loading} className="w-full justify-center py-2 mt-2">
              {loading ? '登入中...' : '登入'}
            </Button>
          </form>

          <p className="text-xs text-stone-600 text-center mt-6">
            密碼僅用於取得學校 Session，不儲存在伺服器
          </p>
        </div>
      </div>
    </div>
  )
}
