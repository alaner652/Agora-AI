import Link from 'next/link'
import { GraduationCap } from 'lucide-react'

/**
 * 落地頁頁尾：再次標註「學生自製・非官方」與安全底線(信任),加快速導覽。
 * 對處理校務帳密的工具,頁尾是強化正當性的地方。
 */
export function LandingFooter() {
  const year = new Date().getFullYear()
  return (
    <footer className="border-t border-border/60">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-10 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-sm space-y-3">
          <Link href="/" aria-label="Agora AI 首頁" className="inline-flex items-center gap-2">
            <GraduationCap className="size-5 text-primary" />
            <span className="font-heading text-base font-semibold text-primary">Agora AI</span>
          </Link>
          <p className="text-xs leading-relaxed text-muted-foreground">
            TPCU 校務 AI 助理，整合課表、缺曠、成績與假單管理，
            並支援 AI 對話操作。
          </p>
          <p className="text-xs text-muted-foreground/70">
            由 <span className="font-medium text-foreground">small R</span> 設計與開發
          </p>
        </div>

        <nav aria-label="頁尾導覽" className="flex flex-col gap-2 text-sm">
          <span className="text-xs font-medium text-muted-foreground/70">導覽</span>
          <Link href="#features" className="text-muted-foreground transition-colors hover:text-foreground">
            功能
          </Link>
          <Link href="#preview" className="text-muted-foreground transition-colors hover:text-foreground">
            展示
          </Link>
          <Link href="#pricing" className="text-muted-foreground transition-colors hover:text-foreground">
            方案
          </Link>
          <Link href="#faq" className="text-muted-foreground transition-colors hover:text-foreground">
            常見問題
          </Link>
          <Link href="/schedule" className="text-muted-foreground transition-colors hover:text-foreground">
            儀表板
          </Link>
        </nav>
      </div>

      <div className="border-t border-border/60">
        <p className="mx-auto w-full max-w-5xl px-6 py-4 text-center text-xs text-muted-foreground/70">
          © {year} Agora AI · 由 small R 打造
        </p>
      </div>
    </footer>
  )
}
