'use client'

import { useState, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Eye, EyeOff, GraduationCap, ShieldCheck } from 'lucide-react'
import { useAuthStore } from '@/lib/stores/auth'
import { errorMessage } from '@/lib/api-error'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { API_BASE_URL as BASE } from '@/constants'

export default function LoginPage() {
  const [uid, setUid] = useState('')
  const [pwd, setPwd] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await fetch(`${BASE}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid, pwd }),
      })
      if (!res.ok) throw Object.assign(new Error(res.statusText), { response: { data: await res.json().catch(() => null) } })
      const { token } = await res.json() as { token: string }
      useAuthStore.getState().setToken(token)
      router.push('/schedule')
    } catch (err: unknown) {
      // 連不到後端（TypeError，無 response）給專屬提示，其餘交給統一解析；
      // 去掉後端訊息可能殘留的結尾冒號（例："登入失敗："）。
      const msg = !(err as { response?: unknown }).response
        ? `無法連線到伺服器${BASE ? `（${BASE}）` : ''}，請確認後端是否運行`
        : errorMessage(err, '登入失敗，請確認學號密碼').replace(/[：:]\s*$/, '')
      toast.error(msg || '登入失敗，請確認學號密碼')
    } finally {
      setLoading(false)
    }
  }

  // 乾淨的填色輸入框：平時無框、淡底，聚焦才浮現品牌色邊框與光環
  const fieldCls =
    'h-11 border-transparent bg-muted/50 focus-visible:bg-card focus-visible:border-ring'

  return (
    <div className="relative flex min-h-svh flex-col items-center justify-center overflow-hidden bg-background p-6 md:p-10">
      {/* 背景：多層緩慢飄移的柔和品牌光暈（與內頁一致，深淺色皆可） */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="animate-float-slow absolute -top-32 left-1/2 size-128 -translate-x-1/4 rounded-full bg-primary/20 blur-[140px]" />
        <div className="animate-float-slow absolute top-1/4 -left-24 size-96 rounded-full bg-primary/12 blur-[130px] [animation-delay:-7s] animation-duration-[24s]" />
        <div className="animate-float-slow absolute -bottom-32 left-1/4 size-128 rounded-full bg-primary/8 blur-[160px] [animation-delay:-14s] animation-duration-[30s]" />
      </div>

      {/* 返回首頁 —— 手機版進到登入後唯一的出口 */}
      <Link
        href="/"
        aria-label="返回 Agora AI 首頁"
        className="absolute left-6 top-6 z-10 inline-flex items-center gap-2 transition-opacity hover:opacity-80"
      >
        <GraduationCap className="size-6 text-primary" />
        <span className="font-heading text-lg font-semibold text-primary">Agora AI</span>
      </Link>

      <div className="relative w-full max-w-sm md:max-w-4xl">
        {/* 透明霧面玻璃卡片 */}
        <div className="overflow-hidden rounded-2xl border border-border bg-card/60 shadow-2xl shadow-black/20 backdrop-blur-2xl">
          <div className="grid md:grid-cols-2">
            {/* 左：表單 */}
            <form onSubmit={handleSubmit} className="flex flex-col gap-6 p-6 md:p-8">
              <div className="flex flex-col items-center gap-1.5 text-center">
                <h1 className="font-heading text-2xl font-semibold tracking-wide text-foreground">歡迎回來</h1>
                <p className="text-sm text-muted-foreground">登入 Agora AI 學生入口</p>
              </div>

              <div className="flex flex-col gap-2">
                <label htmlFor="uid" className="text-sm font-medium text-foreground/80">學號</label>
                <Input
                  id="uid"
                  type="text"
                  value={uid}
                  onChange={e => setUid(e.target.value)}
                  placeholder="e.g. B1234567"
                  required
                  autoFocus
                  autoComplete="username"
                  className={`${fieldCls} font-mono`}
                />
              </div>

              <div className="flex flex-col gap-2">
                <label htmlFor="pwd" className="text-sm font-medium text-foreground/80">密碼</label>
                <div className="relative">
                  <Input
                    id="pwd"
                    type={showPwd ? 'text' : 'password'}
                    value={pwd}
                    onChange={e => setPwd(e.target.value)}
                    required
                    autoComplete="current-password"
                    className={`${fieldCls} pr-10`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd(s => !s)}
                    aria-label={showPwd ? '隱藏密碼' : '顯示密碼'}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    {showPwd ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                size="lg"
                disabled={loading}
                className="h-11 w-full justify-center text-base"
              >
                {loading ? '登入中…' : '登入'}
              </Button>

              <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground/70">
                <ShieldCheck className="size-3.5" />
                密碼僅用於取得學校 Session，不儲存在伺服器
              </p>
            </form>

            {/* 右：品牌視覺（桌機才顯示）— foreground 疊色，深淺色都與左側形成反差 */}
            <div className="relative hidden overflow-hidden border-l border-border bg-foreground/4 backdrop-blur-md md:block">
              {/* 淡同心圓環紋理 */}
              <div
                aria-hidden
                className="absolute inset-0 opacity-70"
                style={{
                  backgroundImage:
                    'repeating-radial-gradient(circle at 70% 30%, color-mix(in oklch, var(--foreground), transparent 90%) 0, color-mix(in oklch, var(--foreground), transparent 90%) 1px, transparent 1px, transparent 36px)',
                  maskImage: 'radial-gradient(ellipse 90% 90% at 70% 30%, black, transparent 85%)',
                  WebkitMaskImage: 'radial-gradient(ellipse 90% 90% at 70% 30%, black, transparent 85%)',
                }}
              />
              {/* 頂部柔光 */}
              <div aria-hidden className="pointer-events-none absolute -top-16 -right-10 size-64 rounded-full bg-primary/10 blur-3xl" />

              <div className="relative flex h-full flex-col justify-center gap-2 p-10">
                <h2 className="font-heading text-4xl font-semibold tracking-wide text-foreground">Agora AI</h2>
                <p className="text-sm text-muted-foreground">台北城市科技大學 · 學生入口</p>
                <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted-foreground/80">
                  課表、缺曠、假單，一站搞定。用 AI 幫你打理校園大小事。
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
