'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import axios from 'axios'
import { toast } from 'sonner'
import { useAuthStore } from '@/lib/stores/auth'
import { errorMessage } from '@/lib/api-error'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { API_BASE_URL as BASE } from '@/constants'

export default function LoginPage() {
  const [uid, setUid] = useState('')
  const [pwd, setPwd] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await axios.post<{ token: string }>(`${BASE}/login`, { uid, pwd })
      useAuthStore.getState().setToken(res.data.token)
      router.push('/schedule')
    } catch (err: unknown) {
      // 連不到後端（沒有 response）給專屬提示，其餘交給統一解析；
      // 去掉後端訊息可能殘留的結尾冒號（例："登入失敗："）。
      const msg = !(err as { response?: unknown }).response
        ? `無法連線到伺服器（${BASE}），請確認後端是否運行`
        : errorMessage(err, '登入失敗，請確認學號密碼').replace(/[：:]\s*$/, '')
      toast.error(msg || '登入失敗，請確認學號密碼')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-background">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold text-primary tracking-wide">Agora AI</h1>
          <p className="text-sm text-muted-foreground/70 mt-1">學生入口</p>
        </div>

        <div className="bg-card border border-border rounded-xl p-8 shadow-sm">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground/80 mb-1.5">學號</label>
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
              <label className="block text-sm font-medium text-foreground/80 mb-1.5">密碼</label>
              <Input
                type="password"
                value={pwd}
                onChange={e => setPwd(e.target.value)}
                required
                className="py-2"
              />
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full justify-center py-2 mt-2 bg-primary hover:bg-primary/90 text-white"
            >
              {loading ? '登入中...' : '登入'}
            </Button>
          </form>

          <p className="text-xs text-muted-foreground/70 text-center mt-6">
            密碼僅用於取得學校 Session，不儲存在伺服器
          </p>
        </div>
      </div>
    </div>
  )
}
