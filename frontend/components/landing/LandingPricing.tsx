'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { Check, KeyRound, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useAuthStore } from '@/lib/stores/auth'
import { fadeUp, staggerContainer, staggerItem } from '@/lib/motion'

/**
 * 定價區塊 —— 目前不收費，所以只描述「免費額度 + 自備金鑰」兩條路，不寫金額。
 *
 * 免費體驗用我們提供的 AI，但每人每日 + 全站名額有上限（後端 quota 把關），
 * 額度用完就引導 BYOK；自備金鑰則無限、模型自選、成本自己掌握。
 * BYOK CTA 依登入狀態導向（已登入 → 設定頁；未登入 → 登入），以 mounted
 * 旗標延後渲染，避免 cookie/auth 來源造成的 hydration 不一致。
 */

const viewport = { once: true, amount: 0.3 }

const FREE_POINTS = [
  '用我們提供的 AI，免準備金鑰',
  '每天有免費則數，先到先得',
  '免註冊，用校務帳號登入即可',
]

const BYOK_POINTS = [
  '填入自己的 AI 金鑰，無限使用',
  '模型自選，速度與成本自己掌握',
  '金鑰加密保存，只用於你的對話',
]

export function LandingPricing() {
  const [mounted, setMounted] = useState(false)
  const token = useAuthStore((s) => s.token)
  useEffect(() => setMounted(true), [])

  // 未 mounted 前一律指向登入，避免 SSR/CSR 不一致；mounted 後才依登入狀態切換。
  const byokHref = mounted && token ? '/settings/llm' : '/login'

  return (
    <section id="pricing" className="mx-auto w-full max-w-5xl scroll-mt-16 px-6 py-24">
      <motion.div
        variants={fadeUp}
        initial="hidden"
        whileInView="show"
        viewport={viewport}
        className="mb-12 text-center"
      >
        <h2 className="font-heading text-3xl font-semibold tracking-wide text-foreground sm:text-4xl">
          先免費試,喜歡再自備金鑰。
        </h2>
        <p className="mt-3 text-muted-foreground">兩條路都不必付月費,差別只在 AI 由誰提供。</p>
      </motion.div>

      <motion.div
        variants={staggerContainer}
        initial="hidden"
        whileInView="show"
        viewport={viewport}
        className="grid gap-4 sm:grid-cols-2"
      >
        {/* 免費體驗 */}
        <motion.div variants={staggerItem} whileHover={{ y: -4 }}>
          <Card className="h-full gap-4 bg-card/60 p-7 backdrop-blur-md ring-border transition-colors hover:ring-primary/40">
            <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Sparkles className="size-5" />
            </div>
            <div>
              <h3 className="text-lg font-medium text-foreground">免費體驗</h3>
              <p className="mt-1 text-sm text-muted-foreground">先試試,零成本上手。</p>
            </div>
            <ul className="space-y-2">
              {FREE_POINTS.map((p) => (
                <FeatureLine key={p}>{p}</FeatureLine>
              ))}
            </ul>
            <Button
              render={<Link href="/schedule" />}
              nativeButton={false}
              variant="outline"
              size="lg"
              className="mt-2 h-11 w-full text-base"
            >
              開始使用
            </Button>
          </Card>
        </motion.div>

        {/* 自備金鑰（主打） */}
        <motion.div variants={staggerItem} whileHover={{ y: -4 }}>
          <Card className="relative h-full gap-4 bg-card/60 p-7 backdrop-blur-md ring-2 ring-primary/40 transition-colors hover:ring-primary/60">
            <span className="absolute right-5 top-5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
              無限使用
            </span>
            <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <KeyRound className="size-5" />
            </div>
            <div>
              <h3 className="text-lg font-medium text-foreground">自備金鑰</h3>
              <p className="mt-1 text-sm text-muted-foreground">用自己的 AI 金鑰,不受額度限制。</p>
            </div>
            <ul className="space-y-2">
              {BYOK_POINTS.map((p) => (
                <FeatureLine key={p}>{p}</FeatureLine>
              ))}
            </ul>
            <Button
              render={<Link href={byokHref} />}
              nativeButton={false}
              size="lg"
              className="mt-2 h-11 w-full text-base"
            >
              前往設定
            </Button>
          </Card>
        </motion.div>
      </motion.div>

      <motion.p
        variants={fadeUp}
        initial="hidden"
        whileInView="show"
        viewport={viewport}
        className="mt-8 text-center text-xs text-muted-foreground/70"
      >
        AI 運算有成本,免費額度是為了讓你先試試;長期使用建議自備金鑰。
      </motion.p>
    </section>
  )
}

function FeatureLine({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2 text-sm text-muted-foreground">
      <Check className="mt-0.5 size-4 shrink-0 text-primary" />
      <span>{children}</span>
    </li>
  )
}
