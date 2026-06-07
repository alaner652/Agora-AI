import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { TOKEN_COOKIE } from '@/constants'
import { LandingHero } from '@/components/landing/LandingHero'
import { LandingFeatures } from '@/components/landing/LandingFeatures'
import { LandingPreview } from '@/components/landing/LandingPreview'
import { LandingFaq } from '@/components/landing/LandingFaq'

export const metadata: Metadata = {
  title: 'Agora AI — 更好用的校務系統體驗',
  description:
    '學生自製的 TPCU 校務助理：課表、缺曠、成績、假單一站查詢，還能用對話操作。用校務帳號登入，密碼不入庫。',
}

/**
 * 根路由：已登入者直接帶進 app（沿用舊行為），未登入者看品牌落地頁。
 * token 存在 cookie，server 端用 cookies() 即可判斷，無需 client JS。
 */
export default async function HomePage() {
  const token = (await cookies()).get(TOKEN_COOKIE)?.value
  if (token) redirect('/schedule')

  return (
    <main className="relative flex flex-col overflow-hidden">
      {/* 全頁共用的環境光暈：fixed → 捲動時整頁一致，避免 Hero 之後突然變全黑。
          各區塊背景透明 / 半透玻璃，光暈會透出來。 */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
        <div className="animate-float-slow absolute -top-40 left-1/2 size-128 -translate-x-1/4 rounded-full bg-primary/15 blur-[150px]" />
        <div className="animate-float-slow absolute top-1/3 -left-24 size-96 rounded-full bg-primary/10 blur-[140px] [animation-delay:-7s]" />
        <div className="animate-float-slow absolute right-0 bottom-0 size-128 rounded-full bg-primary/8 blur-[160px] [animation-delay:-14s]" />
      </div>

      <LandingHero />
      <LandingFeatures />
      <LandingPreview />
      <LandingFaq />
    </main>
  )
}
