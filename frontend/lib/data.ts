import { apiClient } from './api-client'

export interface ToolRecord { name: string; ok: boolean | null }

export interface Attachment {
  id: string       // opaque file_id from server
  filename: string
  mimeType: string
  url: string      // /api/files/{id} — never a local path
}

export interface TextMessage {
  role: 'user' | 'assistant'
  content: string
  toolCalls?: ToolRecord[]
  images?: string[]
  aborted?: boolean
  attachments?: Attachment[]
  attachmentPreview?: string  // blob URL for local preview only, not persisted
  selectedOption?: string     // set when this user message is an ask_user 選項回覆 (chip)
}

export interface SessionMeta {
  session_id: string
  started_at: string
  ended_at: string
  turn_count: number
  title: string
}

interface SessionsResponse {
  sessions: SessionMeta[]
  current_session_id: string | null
}

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
  action_status: string  // 第 12 欄異動說明：「作廢」「無法異動(已核准)」，可刪除時為空
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

// ── Workstudy（工讀考勤 / bk014）──────────────────────────────────────────────

export interface WorkstudyRecord {
  year: string
  month: string
  unit: string
  kind: string
  hours: string
  status: string       // 核銷狀態：未送件 / 已送件…
  unit_id: string
  kind_id: string
  editable: boolean    // 已送件不可改
}

export interface WorkstudyMaster {
  year: string
  sms: string
  months: SemesterOption[]
  units: SemesterOption[]
  records: WorkstudyRecord[]
}

export interface WorkstudyShift {
  date: string         // 民國 YYYMMDD
  t_in: string         // HHMM
  t_out: string        // HHMM
  hours: string        // "1.0"
  seq: string
}

export interface WorkstudyPlan {
  part_month: string
  count: number
  total_hours: number
  entries: WorkstudyShift[]
}

export interface PlanWorkstudyRequest {
  part_month: string
  // 自訂時段：{ 星期: [[起,訖], ...] }，起訖為 HHMM。例 { "2": [["1200","1300"]] }
  pattern: Record<string, [string, string][]>
  skip_dates?: string[]
  month_cap?: number
  semester?: string                   // "114,2"，給課表空堂防呆
  use_schedule_guard?: boolean
}

export interface SaveWorkstudyRequest {
  year: string
  sms: string
  part_month: string
  unit_id: string
  kind_id: string
  kind_name: string
  entries: WorkstudyShift[]
}

export async function getWorkstudyMaster(year: string, sms: string): Promise<WorkstudyMaster> {
  const res = await apiClient.get<WorkstudyMaster>('/api/workstudy/master', { params: { year, sms } })
  return res.data
}

export async function planWorkstudy(req: PlanWorkstudyRequest): Promise<WorkstudyPlan> {
  const res = await apiClient.post<WorkstudyPlan>('/api/workstudy/plan', req)
  return res.data
}

export async function saveWorkstudy(req: SaveWorkstudyRequest): Promise<ApplyLeaveResult> {
  const res = await apiClient.post<ApplyLeaveResult>('/api/workstudy/save', req)
  return res.data
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

export interface LLMBehaviourSettings {
  temperature: number
  max_tokens: number
  system_prompt: string
  context_length: number
}

export interface UserSettings {
  llm: LLMBehaviourSettings
}

export interface FullSettingsResponse {
  uid: string
  settings: UserSettings
  llm_status: LLMConfigResponse
}

export interface LLMBehaviourPatch {
  temperature?: number
  max_tokens?: number
  system_prompt?: string
  context_length?: number
}

export interface TokenUsageDay {
  date: string
  prompt: number
  completion: number
  turns: number
}

export interface TokenUsageResponse {
  days: TokenUsageDay[]
  total_prompt: number
  total_completion: number
  total_turns: number
}

export interface StudentInfo {
  name: string
  student_id: string
  year: string
  semester: string
  semester_value: string
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

export async function getSessions(): Promise<SessionsResponse> {
  const res = await apiClient.get<SessionsResponse>('/api/sessions')
  return {
    sessions: res.data.sessions ?? [],
    current_session_id: res.data.current_session_id ?? null,
  }
}

export async function switchSession(sessionId: string): Promise<TextMessage[]> {
  const res = await apiClient.post<{ messages: TextMessage[] }>(`/api/sessions/${sessionId}/switch`)
  return res.data.messages ?? []
}

export async function deleteSessionById(sessionId: string): Promise<void> {
  await apiClient.delete(`/api/sessions/${sessionId}`)
}

export async function newSession(): Promise<void> {
  await apiClient.post('/api/sessions/new')
}

// ── Unified user settings ─────────────────────────────────────────────────────

export async function getFullSettings(): Promise<FullSettingsResponse> {
  const res = await apiClient.get<FullSettingsResponse>('/api/settings')
  return res.data
}

export async function patchSettings(patch: { llm?: LLMBehaviourPatch }): Promise<UserSettings> {
  const res = await apiClient.patch<UserSettings>('/api/settings', patch)
  return res.data
}

export async function clearChatHistory(): Promise<void> {
  await apiClient.delete('/api/settings/history')
}

export async function clearAllSessions(): Promise<{ deleted: number }> {
  const res = await apiClient.delete<{ deleted: number }>('/api/settings/sessions')
  return res.data
}
