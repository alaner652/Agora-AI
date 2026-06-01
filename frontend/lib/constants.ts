// ── 缺曠 ──────────────────────────────────────────────────────────────────────

export const ALL_PERIODS = [
  '朝會', '自', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'K', 'A', 'B', 'C', 'D', 'E',
]

export const ABSENCE_TYPE_CLS: Record<string, string> = {
  '缺曠': 'bg-red-500/20 text-red-400',
  '病假': 'bg-primary/15 text-primary',
  '事假': 'bg-amber-500/20 text-amber-400',
  '公假': 'bg-sky-500/20 text-sky-400',
  '喪假': 'bg-purple-500/20 text-purple-400',
}

// ── 假單 ──────────────────────────────────────────────────────────────────────

export const PUBLIC_LEAVE_ID = '23'

export const LEAVE_NOTICE_ACK_KEY = 'leave_notice_ack'

export function leaveStatusCls(label: string): string {
  if (label === '已核准' || label === '核准') return 'text-emerald-400 bg-emerald-500/15'
  if (['待審核', '送出', '待核准', '待審'].includes(label)) return 'text-amber-400 bg-amber-500/15'
  if (label === '退件' || label === '不核准') return 'text-red-400 bg-red-500/15'
  if (label === '作廢' || label === '已刪除') return 'text-muted-foreground/50 bg-muted line-through'
  return 'text-muted-foreground bg-muted'
}

export const LEAVE_NOTICE_ITEMS: Array<{
  label: string
  text?: string
  steps?: string[]
}> = [
  { label: '一、事前登錄', text: '請事假或公假等可預期之請假，須於事前上網登錄，並證明事先完成請假手續，事後概不准假。' },
  { label: '二、事後補登', text: '病假或突發事故，無法事先辦理請假者，返校上課 5 日內上網登錄，並證明完成請假手續。' },
  {
    label: '三、准假程序',
    steps: [
      '請假 2 日內：導師（網路線上處理）',
      '請假 3 日內：導師＋輔導教官（網路線上處理）',
      '請假 4–5 日內：導師＋輔導教官＋生輔組長（列印紙本併佐證呈核）',
      '請假 6–7 日內：導師＋輔導教官＋學務長（列印紙本併佐證呈核）',
      '請假 8 日以上：導師＋輔導教官＋生輔組長＋學務長＋校長（列印紙本併佐證呈核）',
    ],
  },
  { label: '四、逾期 / 特案', text: '逾期或特案請假，統以專簽與紙本假單辦理，准假權責：5 日內由生輔組長准假，6 日以上依學務長、校長權限辦理。' },
  { label: '五、紙本假單', text: '紙本假單統一投遞地點為教學區 2 樓生輔組，投遞後請妥善保存根聯，以備日後查核。' },
  { label: '六、考試期間', text: '期中考及期末考之請假，須經課務組核准，方能由授課老師給予補考成績。' },
  { label: '七、登錄確認', text: '請假經核准後送生活輔導組登錄，未經登錄視同曠課。' },
  { label: '八、考試請假', text: '於考試期間請假者，一律列印紙本，按照流程逐一簽核後送生輔組核准。' },
]

// ── 課表 ──────────────────────────────────────────────────────────────────────

export const DAY_LABELS = ['', '一', '二', '三', '四', '五', '六', '日']

export const PERIOD_NUM: Record<string, number> = {
  '第一節': 1, '第二節': 2, '第三節': 3, '第四節': 4, '第五節': 5,
  '第六節': 6, '第七節': 7, '第八節': 8, '第九節': 9, '第十節': 10,
  '第十一節': 11, '第十二節': 12, '第十三節': 13, '第十四節': 14,
}
