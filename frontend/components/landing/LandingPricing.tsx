'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { Check, KeyRound, LayoutGrid } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useAuthStore } from '@/lib/stores/auth'
import { fadeUp, staggerContainer, staggerItem } from '@/lib/motion'

const viewport = { once: true, amount: 0.3 }

const BASIC_POINTS = [
  '課表、缺曠、成績即時查詢',
  '假單申請、查詢與刪除',
  '用校務帳號直接登入，免另外註冊',
]

const BYOK_POINTS = [
  '用自然語言查詢與操作所有功能',
  '支援 OpenAI、Anthropic 等主流模型，自行選擇',
  '金鑰經加密保存，僅用於你自己的對話',
]

export function LandingPricing() {
  const [mounted, setMounted] = useState(false)
  const token = useAuthStore((s) => s.token)
  useEffect(() => setMounted(true), [])

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
          功能一覽
        </h2>
        <p className="mt-3 text-muted-foreground">
          校務功能完全免費；AI 對話需要自備 API 金鑰，費用由你的金鑰帳戶直接計算。
        </p>
      </motion.div>

      <motion.div
        variants={staggerContainer}
        initial="hidden"
        whileInView="show"
        viewport={viewport}
        className="grid gap-4 sm:grid-cols-2"
      >
        {/* 校務功能（免費） */}
        <motion.div variants={staggerItem} whileHover={{ y: -4 }}>
          <Card className="h-full gap-4 bg-card/60 p-7 backdrop-blur-md ring-border transition-colors hover:ring-primary/40">
            <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <LayoutGrid className="size-5" />
            </div>
            <div>
              <h3 className="text-lg font-medium text-foreground">校務功能</h3>
              <p className="mt-1 text-sm text-muted-foreground">登入即可使用，無需任何金鑰。</p>
            </div>
            <ul className="space-y-2">
              {BASIC_POINTS.map((p) => (
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

        {/* AI 對話（需自備金鑰） */}
        <motion.div variants={staggerItem} whileHover={{ y: -4 }}>
          <Card className="relative h-full gap-4 bg-card/60 p-7 backdrop-blur-md ring-2 ring-primary/40 transition-colors hover:ring-primary/60">
            <span className="absolute right-5 top-5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
              需自備金鑰
            </span>
            <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <KeyRound className="size-5" />
            </div>
            <div>
              <h3 className="text-lg font-medium text-foreground">AI 對話</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                設定好 API 金鑰後，用自然語言操作所有校務功能。
              </p>
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
              設定金鑰
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
        AI 金鑰的費用由你的帳戶直接計算，Agora AI 不從中收取任何費用。
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
