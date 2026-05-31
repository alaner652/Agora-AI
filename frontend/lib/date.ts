export function toRocDate(d: Date): string {
  const y = d.getFullYear() - 1911
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}${m}${day}`
}

export function toCEInput(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function inputValToRoc(s: string): string {
  if (!s) return ''
  const d = new Date(s + 'T00:00:00')
  if (isNaN(d.getTime())) return ''
  return toRocDate(d)
}

export function thisMonthRange(): [Date, Date] {
  const now = new Date()
  const first = new Date(now.getFullYear(), now.getMonth(), 1)
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  return [first, last]
}

export function lastMonthRange(): [Date, Date] {
  const now = new Date()
  const first = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const last = new Date(now.getFullYear(), now.getMonth(), 0)
  return [first, last]
}

export function todayRange(): [Date, Date] {
  const now = new Date()
  return [now, now]
}
