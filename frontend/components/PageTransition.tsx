'use client'

import { motion } from 'framer-motion'
import { fadeUp } from '@/lib/motion'

/**
 * 頁面內容掛載時的輕微淡入上移(進場一次)。
 *
 * 獨立成 client leaf,讓 PageLayout 維持 server 模組(其 compound 子元件
 * Trend/TrendCard/Table 才能被 server page 正常存取)。
 */
export function PageTransition({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <motion.div variants={fadeUp} initial="hidden" animate="show" className={className}>
      {children}
    </motion.div>
  )
}
