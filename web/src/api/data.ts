import { http } from './client'

// ── Types ────────────────────────────────────────────────────────────────────

export interface SemesterOption {
  value: string
  label: string
}

export interface ScheduleEntry {
  day: number
  period: number
  course: string
  room: string
  teacher: string
}

export interface AbsenceEntry {
  date: string
  period: string
  course: string
  reason: string
  status: string
}

export interface GradeEntry {
  semester: string
  course: string
  credit: number
  score: number | null
  grade: string
}

export interface LeaveItem {
  id: string
  date: string
  periods: string
  reason: string
  status: string
  type: string
}

// ── API calls ────────────────────────────────────────────────────────────────

export async function getSemesterOptions(): Promise<SemesterOption[]> {
  const res = await http.get<{ options: SemesterOption[] }>('/api/semester-options')
  return res.data.options ?? []
}

export async function getSchedule(semester: string): Promise<ScheduleEntry[]> {
  const res = await http.get<{ entries: ScheduleEntry[] }>('/api/schedule', {
    params: { semester },
  })
  return res.data.entries ?? []
}

export async function getAbsenceOptions(): Promise<{ semesters: SemesterOption[] }> {
  const res = await http.get('/api/absence/options')
  return res.data
}

export async function getAbsence(
  semester: string,
  start: string,
  end: string,
  type = '00',
): Promise<AbsenceEntry[]> {
  const res = await http.get<{ entries: AbsenceEntry[] }>('/api/absence', {
    params: { semester, start, end, type },
  })
  return res.data.entries ?? []
}

export async function getGrades(): Promise<GradeEntry[]> {
  const res = await http.get<{ entries: GradeEntry[] }>('/api/grades')
  return res.data.entries ?? []
}

export async function getLeaves(start: string, end: string): Promise<LeaveItem[]> {
  const res = await http.get<{ leaves: LeaveItem[] }>('/api/leaves', {
    params: { start, end },
  })
  return res.data.leaves ?? []
}
