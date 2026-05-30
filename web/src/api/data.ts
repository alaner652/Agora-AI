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

export interface LeaveType {
  id: string
  name: string
}

export interface LeaveFormData {
  period_order: string[]
  scheduled: string[]
  date: string
  leave_types: LeaveType[]
}

export interface ApplyLeaveRequest {
  date: string       // ROC compact YYYMMDD
  periods: string[]
  leave_id: string
  reason: string
}

export interface ApplyLeaveResult {
  success: boolean | null
  message: string
}

export async function getLeaveForm(date: string): Promise<LeaveFormData> {
  const res = await http.get<LeaveFormData>('/api/leave-form', { params: { date } })
  return res.data
}

export async function applyLeave(req: ApplyLeaveRequest, file?: File): Promise<ApplyLeaveResult> {
  const fd = new FormData()
  fd.append('date', req.date)
  fd.append('periods_json', JSON.stringify(req.periods))
  fd.append('leave_id', req.leave_id)
  fd.append('reason', req.reason)
  if (file) fd.append('attachment', file)
  const res = await http.post<ApplyLeaveResult>('/api/apply-leave', fd)
  return res.data
}

export interface DeleteLeaveRequest {
  stdkey: string
  barcode: string
  start_date: string
  end_date: string
}

export async function deleteLeave(req: DeleteLeaveRequest): Promise<ApplyLeaveResult> {
  const res = await http.post<ApplyLeaveResult>('/api/delete-leave', req)
  return res.data
}

// ── LLM Settings ─────────────────────────────────────────────────────────────

export interface LLMConfigResponse {
  has_custom_config: boolean
  base_url: string
  model: string
}

export interface LLMConfigRequest {
  base_url: string
  api_key: string
  model: string
}

export async function getLLMConfig(): Promise<LLMConfigResponse> {
  const res = await http.get<LLMConfigResponse>('/api/settings/llm')
  return res.data
}

export async function setLLMConfig(req: LLMConfigRequest): Promise<LLMConfigResponse> {
  const res = await http.put<LLMConfigResponse>('/api/settings/llm', req)
  return res.data
}

export async function deleteLLMConfig(): Promise<void> {
  await http.delete('/api/settings/llm')
}

export interface LLMTestResult {
  ok: boolean
  reply?: string
  error?: string
}

export async function testLLMConfig(req: LLMConfigRequest): Promise<LLMTestResult> {
  const res = await http.post<LLMTestResult>('/api/settings/llm/test', req)
  return res.data
}

export interface LLMModelsResult {
  ok: boolean
  models: string[]
  error?: string
}

export async function listLLMModels(base_url: string, api_key: string): Promise<LLMModelsResult> {
  const res = await http.post<LLMModelsResult>('/api/settings/llm/models', { base_url, api_key })
  return res.data
}
