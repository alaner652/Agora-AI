'use client'

import { useRouter, usePathname } from 'next/navigation'
import type { SemesterOption } from '@/lib/data'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface SemesterSelectProps {
  options: SemesterOption[]
  current: string
}

export function SemesterSelect({ options, current }: SemesterSelectProps) {
  const router = useRouter()
  const pathname = usePathname()

  return (
    <Select value={current} onValueChange={value => {
      if (value == null) return
      const params = new URLSearchParams({ semester: value })
      router.push(`${pathname}?${params}`)
    }}>
      <SelectTrigger>
        <SelectValue displayValue={options.find(o => o.value === current)?.label} />
      </SelectTrigger>
      <SelectContent>
        {options.map(o => (
          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
