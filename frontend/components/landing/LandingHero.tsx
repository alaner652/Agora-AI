import Link from 'next/link'
import { ChevronDown, GraduationCap } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * 落地頁首屏。
 *
 * 第一任務是建立信任：本工具要使用者交出校務帳密，且非校方官方系統，
 * 所以開門見山誠實標註「學生自製・非官方」，再講價值與行動。
 * 視覺沿用登入頁的品牌光暈 + 玻璃語言（animate-float-slow / bg-card/60）。
 */
export function LandingHero() {
  return (
    <section className="relative flex min-h-svh flex-col items-center justify-center px-6 py-24 text-center">
      <div className="relative flex w-full max-w-3xl flex-col items-center gap-6">
        {/* 誠實標註：學生自製、非官方 —— 藏起來反而扣分 */}
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card/60 px-3 py-1 text-xs text-muted-foreground backdrop-blur-md">
          <GraduationCap className="size-3.5 text-primary" />
          學生自製・非校方官方系統
        </span>

        <h1 className="font-heading text-4xl font-semibold leading-tight tracking-wide text-foreground sm:text-5xl md:text-6xl">
          重新設計的
          <span className="text-primary">校務系統</span>
          體驗
        </h1>

        <p className="max-w-xl text-base text-muted-foreground sm:text-lg">
          課表、缺曠、成績、假單，一個畫面看完，還能直接用對話查詢與操作。
          <br className="hidden sm:block" />
          用你<span className="text-foreground">現有的校務帳號</span>登入，不必另外註冊。
        </p>

        <div className="mt-2 flex flex-col items-center gap-3 sm:flex-row">
          <Button
            render={<Link href="/login" />}
            nativeButton={false}
            size="lg"
            className="h-11 px-6 text-base"
          >
            開始使用
          </Button>
          <Button
            render={<Link href="#features" />}
            nativeButton={false}
            size="lg"
            variant="outline"
            className="h-11 px-6 text-base"
          >
            了解更多
          </Button>
        </div>
      </div>

      {/* 往下捲動指示 */}
      <Link
        href="#features"
        aria-label="往下看功能介紹"
        className="absolute bottom-8 text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronDown className="size-6 animate-bounce" />
      </Link>
    </section>
  )
}
