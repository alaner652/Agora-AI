'use client'

import { useEffect, useState } from 'react'
import { animate, useReducedMotion } from 'framer-motion'

/**
 * 數字 count-up：從 0 滾動到目標值,自動沿用原本的小數位數。
 * 偏好減少動態時直接顯示最終值,不動畫。
 */
export function CountUp({ value, className }: { value: number; className?: string }) {
  const reduce = useReducedMotion()
  const decimals = (String(value).split('.')[1] ?? '').length
  const [n, setN] = useState(reduce ? value : 0)

  useEffect(() => {
    if (reduce) {
      setN(value)
      return
    }
    const controls = animate(0, value, {
      duration: 0.7,
      ease: 'easeOut',
      onUpdate: (v) => setN(v),
    })
    return () => controls.stop()
  }, [value, reduce])

  return <span className={className}>{n.toFixed(decimals)}</span>
}
