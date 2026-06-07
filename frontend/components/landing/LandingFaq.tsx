import Link from 'next/link'
import { ShieldCheck, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Qa {
  q: string
  a: string
}

// 兩題就是整頁的信任轉換點，老實回答最有說服力。
const FAQS: Qa[] = [
  {
    q: '這是學校官方系統嗎？',
    a: '不是。這是學生自製的工具，不隸屬校方。它只是用你的校務帳號，幫你把「同一份」校務資料整理成更好用的樣子——查到的內容跟你直接登入官方系統一致。',
  },
  {
    q: '我的帳號密碼安全嗎？',
    a: '帳號密碼只用來代你登入校務系統，不會被存進資料庫；登入後的連線憑證只留在伺服器記憶體中。任何設定都經過加密保存，密碼與連線憑證也絕不會出現在紀錄裡。',
  },
  {
    q: '查到的資料會即時更新嗎？',
    a: '會。每次查詢都是即時向校務系統取最新資料，不是快取的舊資料，所以缺曠、成績一更新就看得到。',
  },
  {
    q: '它會幫我送出假單之類的操作嗎？',
    a: '可以，但任何會「改動」資料的動作（例如送出或刪除假單）都會先跟你確認過才執行，不會自作主張。',
  },
]

export function LandingFaq() {
  return (
    <section className="mx-auto w-full max-w-3xl px-6 py-24">
      {/* 安全摘要：對應「機密不落地」的實際做法，這是真賣點 */}
      <div className="mb-12 flex flex-col items-center gap-3 rounded-2xl bg-card/60 p-8 text-center ring-1 ring-border backdrop-blur-md">
        <span className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <ShieldCheck className="size-6" />
        </span>
        <h2 className="font-heading text-2xl font-semibold tracking-wide text-foreground">
          你的資料，我們很在意
        </h2>
        <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
          密碼不入庫、連線憑證只留記憶體、設定全程加密。能少碰的就不碰，是這個工具的底線。
        </p>
      </div>

      <h3 className="mb-6 text-center font-heading text-xl font-semibold tracking-wide text-foreground">
        常見問題
      </h3>

      <div className="space-y-3">
        {FAQS.map(({ q, a }) => (
          <details
            key={q}
            name="faq"
            className="group rounded-xl bg-card/60 ring-1 ring-border backdrop-blur-md transition-colors hover:ring-primary/40 has-[summary:focus-visible]:ring-primary/40 open:ring-primary/30 [&_summary]:list-none"
          >
            <summary className="flex cursor-pointer items-center justify-between gap-4 px-5 py-4 text-sm font-medium text-foreground outline-none transition-colors group-hover:text-primary">
              {q}
              <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180 group-hover:text-primary" />
            </summary>
            <p className="px-5 pb-4 text-sm leading-relaxed text-muted-foreground">{a}</p>
          </details>
        ))}
      </div>

      {/* 收尾 CTA */}
      <div className="mt-16 flex flex-col items-center gap-4 text-center">
        <h3 className="font-heading text-2xl font-semibold tracking-wide text-foreground">
          準備好了嗎？
        </h3>
        <Button
          render={<Link href="/login" />}
          nativeButton={false}
          size="lg"
          className="h-11 px-8 text-base shadow-lg shadow-primary/20 transition-transform hover:-translate-y-0.5"
        >
          用校務帳號開始使用
        </Button>
        <p className="text-xs text-muted-foreground">免註冊・密碼不入庫</p>
      </div>
    </section>
  )
}
