import { http } from './client'

// ── Types ────────────────────────────────────────────────────────────────────

export interface SemesterOption {
  value: string
  label: string
  selected: boolean
}

export interface ScheduleEntry {
  weekday: number      // 1=週一, 2=週二, ..., 7=週日
  period: string       // e.g. "第一節"
  time_range: string   // e.g. "0820-0910"
  course: string
  teacher: string
  classroom: string
}

export interface AbsenceEntry {
  date: string         // e.g. "115/05/18"
  weekday: string      // e.g. "一"
  period: string       // e.g. "第一節"
  type: string         // e.g. "缺曠", "事假"
}

export interface AbsenceOptions {
  semesters: SemesterOption[]
  leave_types: { value: string; label: string; selected: boolean }[]
}

export interface GradeEntry {
  semester: string
  course: string
  type: string         // "必修" | "選修"
  credits: string      // e.g. "2"
  score: string        // e.g. "85" or "" (no score yet)
  passed: boolean
}

export interface LeaveItem {
  index: string
  barcode: string
  reason: string
  apply_date: string
  start_date: string
  end_date: string
  teacher_status: string
  teacher_note: string
  officer_status: string
  officer_note: string
  stdkey: string
  can_delete: boolean
}

// ── API calls ────────────────────────────────────────────────────────────────

export async function getSemesterOptions(): Promise<SemesterOption[]> {
  const res = await http.get<{ semesters: SemesterOption[] }>('/api/semester-options')
  return res.data.semesters ?? []
}

export async function getSchedule(semester: string): Promise<ScheduleEntry[]> {
  const res = await http.get<{ entries: ScheduleEntry[] }>('/api/schedule', {
    params: { semester },
  })
  return res.data.entries ?? []
}

export async function getAbsenceOptions(): Promise<AbsenceOptions> {
  const res = await http.get<AbsenceOptions>('/api/absence/options')
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
