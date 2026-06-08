import type { Metadata } from 'next'
import { LandingNav } from '@/components/landing/LandingNav'
import { LandingHero } from '@/components/landing/LandingHero'
import { LandingFeatures } from '@/components/landing/LandingFeatures'
import { LandingPreview } from '@/components/landing/LandingPreview'
import { LandingFaq } from '@/components/landing/LandingFaq'
import { LandingFooter } from '@/components/landing/LandingFooter'

export const metadata: Metadata = {
  title: 'Agora AI — 你的校務，一句話就好',
  description:
    '學生自製的 TPCU 校務助理：課表、缺曠、成績、假單一站看完，還能用對話查詢與操作，會改動的動作先確認。用校務帳號登入，密碼不入庫。',
  authors: [{ name: 'small R' }],
}

/**
 * 根路由：品牌落地頁。登入與否都可瀏覽(middleware 已將 / 列為公開);
 * 登入狀態相關的導覽由 LandingNav 在 client 端處理。
 */
export default function HomePage() {
  return (
    <>
      {/* 全頁共用的環境光暈：fixed → 捲動時整頁一致，避免 Hero 之後突然變全黑。
          各區塊背景透明 / 半透玻璃，光暈會透出來。 */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
        <div className="animate-float-slow absolute -top-40 left-1/2 size-128 -translate-x-1/4 rounded-full bg-primary/15 blur-[150px]" />
        <div className="animate-float-slow absolute top-1/3 -left-24 size-96 rounded-full bg-primary/10 blur-[140px] [animation-delay:-7s]" />
        <div className="animate-float-slow absolute right-0 bottom-0 size-128 rounded-full bg-primary/8 blur-[160px] [animation-delay:-14s]" />
      </div>

      <LandingNav />
      <main className="relative flex flex-1 flex-col overflow-x-hidden">
        <LandingHero />
        <LandingFeatures />
        <LandingPreview />
        <LandingFaq />
      </main>
      <LandingFooter />
    </>
  )
}
