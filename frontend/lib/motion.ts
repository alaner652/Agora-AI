import type { Transition, Variants } from 'framer-motion'

/**
 * 全站共用的 framer-motion 變體與時長 —— 集中於此,改一處全站一致。
 * 原則：內頁動效短(150–250ms)、只播一次、只動 opacity/translate。
 * 全域已在 providers 設 MotionConfig reducedMotion="user",元件層不必再判斷。
 */

export const springSnappy: Transition = { type: 'spring', stiffness: 320, damping: 30 }

/** 區塊掛載時的輕微淡入上移(進場用)。 */
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.25, ease: 'easeOut' } },
}

/** 清單容器：子項依序進場。 */
export const staggerContainer: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
}

/** 清單子項(搭配 staggerContainer)。 */
export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.22, ease: 'easeOut' } },
}
