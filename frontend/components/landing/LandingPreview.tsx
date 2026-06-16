'use client'

import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Bot, ChevronDown, Loader2, Send } from 'lucide-react'
import { cn } from '@/lib/utils'
import { fadeUp } from '@/lib/motion'

/**
 * 畫面預覽 —— 自動循環、多情境的對話動畫 demo（非截圖）。
 *
 * 情境取材自真實對話紀錄(查課表 / 查缺曠 / 請假確認),含真實課程資料、
 * 多工具呼叫、ask_user 確認彈窗等實際 UX。忠實還原 ChatView 的 UI。
 * 尊重 prefers-reduced-motion：偏好減少動態時停在靜態最終狀態、不循環。
 */

type Tool = { name: string; ok?: boolean } // ok undefined = 進行中
type Table = { head: string[]; rows: string[][] }
type AssistantMsg = {
  id: number
  role: 'assistant'
  tools: Tool[]
  text?: string
  table?: Table
  bullets?: string[]
}
type UserMsg = { id: number; role: 'user'; text: string; option?: boolean }
type Msg = AssistantMsg | UserMsg

type Step =
  | { kind: 'user'; text: string }
  | { kind: 'assistant'; tools: string[]; text?: string; table?: Table; bullets?: string[] }
  | { kind: 'confirm'; question: string; options: string[]; pick: string }

const SCENARIOS: Step[][] = [
  // 1) 查課表 —— 多工具 + 真實課程表格
  [
    { kind: 'user', text: '查詢本學期課表' },
    {
      kind: 'assistant',
      tools: ['取得學期清單', '查詢課表'],
      table: {
        head: ['星期', '時間', '課程', '教室'],
        rows: [
          ['一', '0920', '資料庫', '成302'],
          ['一', '1300', '視窗程式設計', '成302'],
          ['三', '1020', '電路學', '財707'],
          ['三', '1300', '資料結構', '財707'],
        ],
      },
      text: '這是你 **114 學年第 2 學期** 的課表,共 11 堂、橫跨週一到週五。',
    },
  ],
  // 2) 查缺曠 —— 多工具,且如實回報「沒有記錄」
  [
    { kind: 'user', text: '我這週缺幾節課？' },
    {
      kind: 'assistant',
      tools: ['取得目前時間', '取得學期清單', '查詢缺曠'],
      text: '這週(06/01–06/07)目前 **沒有缺曠記錄** ✅',
    },
  ],
  // 3) 請假 —— 多工具 + ask_user 確認彈窗 + 送出
  [
    { kind: 'user', text: '幫我請週三下午的病假' },
    { kind: 'assistant', tools: ['取得假單選項', '查詢課表'] },
    {
      kind: 'confirm',
      question: '確定要送出這張假單嗎？\n6/10(三) 下午 5–7 節 · 病假',
      options: ['是，確認送出', '再想想'],
      pick: '是，確認送出',
    },
    {
      kind: 'assistant',
      tools: ['申請假單'],
      text: '已送出 6/10(三) 下午的 **病假** 單,目前狀態:待審核 ⏳',
    },
  ],
]

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const viewport = { once: true, amount: 0.4 }

export function LandingPreview() {
  const [messages, setMessages] = useState<Msg[]>([])
  const [typed, setTyped] = useState('')
  const [card, setCard] = useState<{ question: string; options: string[]; pick: string; lit: boolean } | null>(null)
  const idRef = useRef(0)
  const rootRef = useRef<HTMLElement>(null)
  const reduce = useReducedMotion()
  const [active, setActive] = useState(false)

  // 只在「捲到視窗內 + 分頁在前景」時才跑動畫迴圈,離開即暫停 —— 同時解決
  // 背景空轉(效能)與報讀器讀到變動內容(無障礙,另以 aria-hidden 處理)。
  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    let inView = false
    const sync = () => setActive(inView && !document.hidden)
    const io = new IntersectionObserver(
      ([e]) => {
        inView = e.isIntersecting
        sync()
      },
      { threshold: 0.2 },
    )
    io.observe(el)
    document.addEventListener('visibilitychange', sync)
    return () => {
      io.disconnect()
      document.removeEventListener('visibilitychange', sync)
    }
  }, [])

  // reduced-motion:直接靜態呈現第一個情境,不循環
  useEffect(() => {
    if (!reduce) return
    const first = SCENARIOS[0][1]
    setMessages([
      { id: ++idRef.current, role: 'user', text: '查詢本學期課表' },
      {
        id: ++idRef.current,
        role: 'assistant',
        tools: [{ name: '取得學期清單', ok: true }, { name: '查詢課表', ok: true }],
        table: first.kind === 'assistant' ? first.table : undefined,
        text: '這是你 **114 學年第 2 學期** 的課表,共 11 堂、橫跨週一到週五。',
      },
    ])
  }, [reduce])

  useEffect(() => {
    if (reduce || !active) return

    const nextId = () => ++idRef.current
    let cancelled = false
    const guard = () => cancelled

    const type = async (text: string) => {
      for (let i = 1; i <= text.length; i++) {
        if (guard()) return true
        setTyped(text.slice(0, i))
        await sleep(95)
      }
      return false
    }

    const patch = (id: number, fn: (m: AssistantMsg) => AssistantMsg) =>
      setMessages((prev) => prev.map((m) => (m.id === id && m.role === 'assistant' ? fn(m) : m)))

    async function play(step: Step): Promise<boolean> {
      if (step.kind === 'user') {
        if (await type(step.text)) return true
        await sleep(300)
        setMessages((prev) => [...prev, { id: nextId(), role: 'user', text: step.text }])
        setTyped('')
        await sleep(450)
        return guard()
      }
      if (step.kind === 'confirm') {
        setCard({ question: step.question, options: step.options, pick: step.pick, lit: false })
        await sleep(1700)
        if (guard()) return true
        setCard((c) => (c ? { ...c, lit: true } : c))
        await sleep(850)
        if (guard()) return true
        setCard(null)
        setMessages((prev) => [...prev, { id: nextId(), role: 'user', text: step.pick, option: true }])
        await sleep(450)
        return guard()
      }
      const id = nextId()
      setMessages((prev) => [...prev, { id, role: 'assistant', tools: step.tools.map((name) => ({ name })) }])
      await sleep(550)
      for (let i = 0; i < step.tools.length; i++) {
        if (guard()) return true
        patch(id, (m) => ({ ...m, tools: m.tools.map((t, ti) => (ti === i ? { ...t, ok: true } : t)) }))
        await sleep(420)
      }
      await sleep(350)
      patch(id, (m) => ({ ...m, text: step.text, table: step.table, bullets: step.bullets }))
      await sleep(2600)
      return guard()
    }

    async function run() {
      let s = 0
      while (!cancelled) {
        setMessages([])
        await sleep(450)
        for (const step of SCENARIOS[s]) {
          if (await play(step)) return
        }
        await sleep(2600)
        s = (s + 1) % SCENARIOS.length
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [active, reduce])

  const processing = messages.some((m) => m.role === 'assistant' && m.tools.some((t) => t.ok === undefined))

  return (
    <section id="preview" ref={rootRef} className="mx-auto w-full max-w-5xl scroll-mt-16 px-6 py-24">
      <motion.div
        variants={fadeUp}
        initial="hidden"
        whileInView="show"
        viewport={viewport}
        className="mb-12 text-center"
      >
        <h2 className="font-heading text-3xl font-semibold tracking-wide text-foreground sm:text-4xl">
          說出來，它就替你做。
        </h2>
        <p className="mt-3 text-muted-foreground">
          查課表、看缺曠、送假單，一句話的事。需要改動資料的操作，一定先確認再執行。
        </p>
      </motion.div>

      <motion.div
        aria-hidden
        variants={fadeUp}
        initial="hidden"
        whileInView="show"
        viewport={viewport}
        className="mx-auto max-w-xl overflow-hidden rounded-2xl bg-card/60 shadow-2xl shadow-black/20 ring-1 ring-border backdrop-blur-md"
      >
        <div className="flex items-center gap-1.5 border-b border-border px-4 py-3">
          <span className="size-3 rounded-full bg-destructive/60" />
          <span className="size-3 rounded-full bg-amber-500/60" />
          <span className="size-3 rounded-full bg-emerald-500/60" />
          <span className="ml-3 inline-flex items-center gap-1.5 truncate text-xs text-muted-foreground">
            <Bot className="size-3.5 text-primary" />
            agora · AI 助理
          </span>
        </div>

        {/* 對話區(固定高度、內容靠底、過長上方裁切如真實捲動) */}
        <div className="flex h-112 flex-col bg-card p-4">
          <div className="flex flex-1 flex-col justify-end gap-4 overflow-hidden">
            <AnimatePresence mode="popLayout" initial={false}>
              {messages.map((m) => (
                <motion.div
                  key={m.id}
                  layout
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, transition: { duration: 0.2 } }}
                  transition={{ type: 'spring', stiffness: 320, damping: 30 }}
                >
                  {m.role === 'user' ? (m.option ? <OptionChip>{m.text}</OptionChip> : <UserBubble>{m.text}</UserBubble>) : <AssistantMessage msg={m} />}
                </motion.div>
              ))}

              {card && (
                <motion.div
                  key="card"
                  layout
                  initial={{ opacity: 0, y: 12, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.2 } }}
                  transition={{ type: 'spring', stiffness: 320, damping: 30 }}
                  className="flex gap-3"
                >
                  <Avatar />
                  <div className="max-w-sm rounded-2xl rounded-tl-sm border border-border bg-card/70 px-4 py-3 shadow-sm backdrop-blur-xl">
                    <p className="mb-3 whitespace-pre-line text-sm leading-relaxed text-foreground">
                      {card.question}
                    </p>
                    <div className="space-y-1.5">
                      {card.options.map((opt) => {
                        const picked = card.lit && opt === card.pick
                        return (
                          <motion.div
                            key={opt}
                            animate={{ scale: picked ? 0.97 : 1 }}
                            transition={{ duration: 0.15 }}
                            className={cn(
                              'w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors',
                              picked
                                ? 'border-primary/40 bg-accent text-primary'
                                : 'border-border bg-background text-foreground',
                            )}
                          >
                            {opt}
                          </motion.div>
                        )
                      })}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* 輸入列:打字機效果 */}
          <div className="mt-3 flex items-end gap-2">
            <div
              className={cn(
                'flex h-9 flex-1 items-center rounded-lg border border-border bg-muted px-3 text-sm',
                !typed && 'opacity-60',
              )}
            >
              {typed ? (
                <span className="text-foreground">
                  {typed}
                  <span className="ml-0.5 inline-block h-4 w-px translate-y-0.5 animate-pulse bg-primary" />
                </span>
              ) : (
                <span className="text-muted-foreground">輸入訊息…</span>
              )}
            </div>
            <div
              className={cn(
                'flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors',
                typed ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
              )}
            >
              {processing ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            </div>
          </div>
          <p className="mt-1.5 text-center text-xs text-muted-foreground/70">
            AI 可能會出錯,重要事項請自行確認
          </p>
        </div>
      </motion.div>
    </section>
  )
}

function Avatar() {
  return (
    <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-accent text-primary">
      <Bot className="size-4" />
    </span>
  )
}

function UserBubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="ml-auto w-fit max-w-[78%] rounded-2xl rounded-tr-sm bg-primary px-4 py-2.5 text-sm leading-relaxed text-primary-foreground">
      {children}
    </div>
  )
}

function OptionChip({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex justify-end">
      <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-accent/60 px-3 py-1.5 text-xs text-muted-foreground">
        <svg className="h-3 w-3 shrink-0 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
        </svg>
        <span className="text-muted-foreground/70">已選擇</span>
        <span className="font-medium text-foreground">{children}</span>
      </span>
    </div>
  )
}

function AssistantMessage({ msg }: { msg: AssistantMsg }) {
  const running = msg.tools.some((t) => t.ok === undefined)
  return (
    <div className="flex gap-3">
      <Avatar />
      <div className="min-w-0 flex-1 space-y-2">
        {running ? <LiveTools tools={msg.tools} /> : <DoneTools tools={msg.tools} />}
        {!running && msg.text && <RichText text={msg.text} />}
        {!running && msg.bullets && (
          <ul className="space-y-0.5 pl-4 text-sm text-foreground">
            {msg.bullets.map((b) => (
              <li key={b} className="list-disc">{b}</li>
            ))}
          </ul>
        )}
        {!running && msg.table && <ResultTable table={msg.table} />}
      </div>
    </div>
  )
}

function LiveTools({ tools }: { tools: Tool[] }) {
  return (
    <div className="space-y-1">
      {tools.map((t) => (
        <div key={t.name} className="flex items-center gap-2 text-xs text-muted-foreground">
          {t.ok === undefined ? (
            <Loader2 className="size-3 shrink-0 animate-spin" />
          ) : (
            <span className="text-emerald-400">✓</span>
          )}
          {t.name}
        </div>
      ))}
    </div>
  )
}

function DoneTools({ tools }: { tools: Tool[] }) {
  return (
    <div className="text-xs">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <ChevronDown className="size-3" />
        已使用 {tools.length} 個工具
      </div>
      <div className="mt-1 space-y-1 border-l border-border pl-4">
        {tools.map((t) => (
          <div key={t.name} className="flex items-center gap-2 text-muted-foreground">
            <span className="size-1.5 shrink-0 rounded-full bg-emerald-400" />
            {t.name}
          </div>
        ))}
      </div>
    </div>
  )
}

function ResultTable({ table }: { table: Table }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border text-xs">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            {table.head.map((h) => (
              <th key={h} className="border-b border-border bg-muted px-3 py-1.5 text-left font-medium text-muted-foreground">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row) => (
            <tr key={row.join()}>
              {row.map((cell, i) => (
                <td key={i} className="border-b border-border px-3 py-1.5 text-foreground">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** 極簡 **粗體** 渲染(對齊 ChatView 的 markdown 粗體)。 */
function RichText({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return (
    <p className="text-sm leading-relaxed text-foreground">
      {parts.map((p, i) =>
        p.startsWith('**') && p.endsWith('**') ? (
          <strong key={i} className="font-semibold">{p.slice(2, -2)}</strong>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </p>
  )
}
