import { apiClient } from './api-client'

export interface SemesterOption {
  value: string
  label: string
  selected: boolean
}

export interface ScheduleEntry {
  weekday: number
  period: string
  time_range: string
  course: string
  teacher: string
  classroom: string
}

export interface AbsenceEntry {
  date: string
  weekday: string
  period: string
  type: string
}

export interface AbsenceOptions {
  semesters: SemesterOption[]
  leave_types: { value: string; label: string; selected: boolean }[]
}

export interface GradeEntry {
  semester: string
  course: string
  type: string
  credits: string
  score: string
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
  date: string
  periods: string[]
  leave_id: string
  reason: string
}

export interface ApplyLeaveResult {
  success: boolean | null
  message: string
}

export interface DeleteLeaveRequest {
  stdkey: string
  barcode: string
  start_date: string
  end_date: string
}

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

export interface LLMTestResult {
  ok: boolean
  reply?: string
  error?: string
}

export interface LLMModelsResult {
  ok: boolean
  models: string[]
  error?: string
}

export async function getSemesterOptions(): Promise<SemesterOption[]> {
  const res = await apiClient.get<{ semesters: SemesterOption[] }>('/api/semester-options')
  return res.data.semesters ?? []
}

export async function getAbsenceOptions(): Promise<AbsenceOptions> {
  const res = await apiClient.get<AbsenceOptions>('/api/absence/options')
  return res.data
}

export async function getAbsence(semester: string, start: string, end: string, type = '00'): Promise<AbsenceEntry[]> {
  const res = await apiClient.get<{ entries: AbsenceEntry[] }>('/api/absence', {
    params: { semester, start, end, type },
  })
  return res.data.entries ?? []
}

export async function getLeaves(start: string, end: string): Promise<LeaveItem[]> {
  const res = await apiClient.get<{ leaves: LeaveItem[] }>('/api/leaves', {
    params: { start, end },
  })
  return res.data.leaves ?? []
}

export async function getLeaveForm(date: string): Promise<LeaveFormData> {
  const res = await apiClient.get<LeaveFormData>('/api/leave-form', { params: { date } })
  return res.data
}

export async function applyLeave(req: ApplyLeaveRequest, file?: File): Promise<ApplyLeaveResult> {
  const fd = new FormData()
  fd.append('date', req.date)
  fd.append('periods_json', JSON.stringify(req.periods))
  fd.append('leave_id', req.leave_id)
  fd.append('reason', req.reason)
  if (file) fd.append('attachment', file)
  const res = await apiClient.post<ApplyLeaveResult>('/api/apply-leave', fd)
  return res.data
}

export async function deleteLeave(req: DeleteLeaveRequest): Promise<ApplyLeaveResult> {
  const res = await apiClient.post<ApplyLeaveResult>('/api/delete-leave', req)
  return res.data
}

export async function getLLMConfig(): Promise<LLMConfigResponse> {
  const res = await apiClient.get<LLMConfigResponse>('/api/settings/llm')
  return res.data
}

export async function setLLMConfig(req: LLMConfigRequest): Promise<LLMConfigResponse> {
  const res = await apiClient.put<LLMConfigResponse>('/api/settings/llm', req)
  return res.data
}

export async function deleteLLMConfig(): Promise<void> {
  await apiClient.delete('/api/settings/llm')
}

export async function testLLMConfig(req: LLMConfigRequest): Promise<LLMTestResult> {
  const res = await apiClient.post<LLMTestResult>('/api/settings/llm/test', req)
  return res.data
}

export async function listLLMModels(base_url: string, api_key: string): Promise<LLMModelsResult> {
  const res = await apiClient.post<LLMModelsResult>('/api/settings/llm/models', { base_url, api_key })
  return res.data
}
