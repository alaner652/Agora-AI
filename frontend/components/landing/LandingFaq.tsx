'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { fadeUp, staggerContainer, staggerItem } from '@/lib/motion'

interface Qa {
  q: string
  a: string
}

const FAQS: Qa[] = [
  {
    q: '查到的資料是即時的嗎？',
    a: '是。每次查詢都直接向校務系統取最新資料，缺曠、成績一有更新就能立刻看到，不是快取的舊資料。',
  },
  {
    q: 'AI 可以幫我送假單嗎？',
    a: '可以。直接告訴 AI 你要請什麼假、哪幾節，它會幫你整理好細節，並在送出前先讓你確認，確認後才執行。',
  },
  {
    q: 'AI 對話功能需要自己準備金鑰嗎？',
    a: '需要。AI 對話需要自備 API 金鑰（支援 OpenAI、Anthropic 等主流服務），費用由你的帳戶直接計算，Agora AI 不從中收取任何費用。課表、缺曠、成績、假單等校務功能則完全不需要金鑰。',
  },
  {
    q: '支援哪些 AI 模型？',
    a: '目前支援 OpenAI（GPT-4o、GPT-4.1 等）與 Anthropic（Claude 系列）的模型，可在設定頁自由切換，速度與成本自己掌握。',
  },
]

const viewport = { once: true, amount: 0.3 }

export function LandingFaq() {
  return (
    <section id="faq" className="mx-auto w-full max-w-3xl scroll-mt-16 px-6 py-24">
      <motion.div
        variants={fadeUp}
        initial="hidden"
        whileInView="show"
        viewport={viewport}
        className="mb-12 text-center"
      >
        <h2 className="font-heading text-3xl font-semibold tracking-wide text-foreground sm:text-4xl">
          常見問題
        </h2>
      </motion.div>

      <motion.div
        variants={staggerContainer}
        initial="hidden"
        whileInView="show"
        viewport={viewport}
        className="space-y-3"
      >
        {FAQS.map(({ q, a }) => (
          <motion.details
            key={q}
            variants={staggerItem}
            name="faq"
            className="group rounded-xl bg-card/60 ring-1 ring-border backdrop-blur-md transition-colors hover:ring-primary/40 has-[summary:focus-visible]:ring-primary/40 open:ring-primary/30 [&_summary]:list-none"
          >
            <summary className="flex cursor-pointer items-center justify-between gap-4 px-5 py-4 text-sm font-medium text-foreground outline-none transition-colors group-hover:text-primary">
              {q}
              <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180 group-hover:text-primary" />
            </summary>
            <p className="px-5 pb-4 text-sm leading-relaxed text-muted-foreground">{a}</p>
          </motion.details>
        ))}
      </motion.div>

      <motion.div
        variants={fadeUp}
        initial="hidden"
        whileInView="show"
        viewport={viewport}
        className="mt-16 flex flex-col items-center gap-4 text-center"
      >
        <h3 className="font-heading text-2xl font-semibold tracking-wide text-foreground">
          準備好了嗎？
        </h3>
        <Button
          render={<Link href="/schedule" />}
          nativeButton={false}
          size="lg"
          className="h-11 px-8 text-base shadow-lg shadow-primary/20 transition-transform hover:-translate-y-0.5"
        >
          用校務帳號開始使用
        </Button>
        <p className="text-xs text-muted-foreground">免另外註冊，直接用現有帳號登入</p>
      </motion.div>
    </section>
  )
}
