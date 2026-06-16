'use client'

import { motion } from 'framer-motion'
import { Calendar, Bot, Bell, Smartphone, type LucideIcon } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { fadeUp, staggerContainer, staggerItem } from '@/lib/motion'

interface Feature {
  icon: LucideIcon
  title: string
  desc: string
}

// 手機友善僅在 RWD 確實驗證後才保留；其餘三項對應實際已上線功能。
const FEATURES: Feature[] = [
  {
    icon: Calendar,
    title: '一眼就懂的課表',
    desc: '週課表一目了然，節次、地點、授課教師整齊排列，不必再從密密麻麻的系統介面裡翻找。',
  },
  {
    icon: Bot,
    title: 'AI 幫你查，也幫你辦',
    desc: '直接問：「我這週缺幾節？」「幫我看上學期成績」—— AI 替你查，需要改動資料的動作一定先問過你再執行。',
  },
  {
    icon: Bell,
    title: '所有校務，集中一處',
    desc: '課表、缺曠、成績、假單整合在同一個畫面。每次查詢都即時向校務系統取最新資料，不是舊快取。',
  },
  {
    icon: Smartphone,
    title: '行動裝置優先',
    desc: '針對小螢幕重新設計排版，走在路上也能隨手查課表、送假單，操作流暢如原生 app。',
  },
]

const viewport = { once: true, amount: 0.3 }

export function LandingFeatures() {
  return (
    <section id="features" className="mx-auto w-full max-w-5xl scroll-mt-16 px-6 py-24">
      <motion.div
        variants={fadeUp}
        initial="hidden"
        whileInView="show"
        viewport={viewport}
        className="mb-12 text-center"
      >
        <h2 className="font-heading text-3xl font-semibold tracking-wide text-foreground sm:text-4xl">
          把校務日常，重新設計。
        </h2>
        <p className="mt-3 text-muted-foreground">
          原有系統堪用，但互動體驗停在上個世代。Agora AI 用現代介面呈現同一份校務資料 —— 更快、更清晰、更好用。
        </p>
      </motion.div>

      <motion.div
        variants={staggerContainer}
        initial="hidden"
        whileInView="show"
        viewport={viewport}
        className="grid gap-4 sm:grid-cols-2"
      >
        {FEATURES.map(({ icon: Icon, title, desc }) => (
          <motion.div key={title} variants={staggerItem} whileHover={{ y: -4 }}>
            <Card className="h-full gap-3 bg-card/60 p-6 backdrop-blur-md ring-border transition-colors hover:ring-primary/40">
              <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon className="size-5" />
              </div>
              <h3 className="text-lg font-medium text-foreground">{title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{desc}</p>
            </Card>
          </motion.div>
        ))}
      </motion.div>
    </section>
  )
}
