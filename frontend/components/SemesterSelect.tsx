'use client'

import { useRouter, usePathname } from 'next/navigation'
import type { SemesterOption } from '@/lib/data'

interface SemesterSelectProps {
  options: SemesterOption[]
  current: string
}

export function SemesterSelect({ options, current }: SemesterSelectProps) {
  const router = useRouter()
  const pathname = usePathname()

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const params = new URLSearchParams({ semester: e.target.value })
    router.push(`${pathname}?${params}`)
  }

  return (
    <select
      value={current}
      onChange={handleChange}
      className="bg-white border border-stone-300 text-stone-900 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400/50"
    >
      {options.map(o => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  )
}
