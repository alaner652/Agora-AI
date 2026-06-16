'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { ChevronDown, GraduationCap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { staggerContainer, staggerItem } from '@/lib/motion'

/**
 * 落地頁首屏。
 *
 * 第一任務是建立信任：本工具要使用者交出校務帳密，且非校方官方系統，
 * 所以開門見山誠實標註「學生自製・非官方」，再講價值與行動。
 * 載入時內容依序淡入(stagger);往下捲指示緩慢浮動。
 */
export function LandingHero() {
  return (
    <section className="relative flex min-h-svh flex-col items-center justify-center px-6 py-24 text-center">
      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="show"
        className="relative flex w-full max-w-3xl flex-col items-center gap-6"
      >
        <motion.span
          variants={staggerItem}
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card/60 px-3 py-1 text-xs text-muted-foreground backdrop-blur-md"
        >
          <GraduationCap className="size-3.5 text-primary" />
          TPCU 校務 AI 助理
        </motion.span>

        <h1 className="font-heading text-4xl font-semibold leading-tight tracking-wide text-foreground sm:text-5xl md:text-6xl">
          讓校務查詢
          <br />
          <span className="text-primary">變得理所當然</span>
        </h1>

        <motion.p
          variants={staggerItem}
          className="max-w-xl text-base text-muted-foreground sm:text-lg"
        >
          課表、缺曠、成績、假單整合在同一個畫面
          <br className="hidden sm:block" />
          搭配 AI 助理，一句話就能查詢或操作
          <br className="hidden sm:block" />
          用<span className="text-foreground">現有的校務帳號</span>直接登入，不必另外註冊
        </motion.p>

        <motion.div variants={staggerItem} className="mt-2 flex flex-col items-center gap-3 sm:flex-row">
          <Button
            render={<Link href="/schedule" />}
            nativeButton={false}
            size="lg"
            className="h-11 px-6 text-base shadow-lg shadow-primary/20"
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
        </motion.div>
      </motion.div>

      {/* 往下捲動指示 */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8, duration: 0.6 }}
        className="absolute bottom-8"
      >
        <Link
          href="#features"
          aria-label="往下看功能介紹"
          className="text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronDown className="size-6 animate-bounce" />
        </Link>
      </motion.div>
    </section>
  )
}
