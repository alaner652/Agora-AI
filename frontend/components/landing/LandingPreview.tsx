'use client'

import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Bot, ChevronDown, Loader2, Send } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * 畫面預覽 —— 自動循環、多情境的對話動畫 demo（非截圖）。
 *
 * 輪播多個真實 UX 情境：缺曠+請假（ask_user 確認彈窗）、查成績（表格）、
 * 查課表（條列）、多工具整合（「已使用 N 個工具」面板）。
 * 忠實還原 ChatView 的 UI；動效用 framer-motion。
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
type UserMsg = { id: number; role: 'user'; text: string }
type Msg = AssistantMsg | UserMsg

type Step =
  | { kind: 'user'; text: string }
  | { kind: 'assistant'; tools: string[]; text?: string; table?: Table; bullets?: string[] }
  | { kind: 'confirm'; question: string; options: string[]; pick: string }

const SCENARIOS: Step[][] = [
  // 1) 缺曠查詢 → 反問 → 請假（危險操作：ask_user 確認彈窗）
  [
    { kind: 'user', text: '我這週缺幾節課？' },
    {
      kind: 'assistant',
      tools: ['查詢缺曠'],
      text: '這週你有 **2 節** 缺曠，都集中在週三下午。要我幫你補請假單嗎？',
    },
    { kind: 'user', text: '好，幫我請週三下午的病假' },
    {
      kind: 'confirm',
      question: '確定要送出這張假單嗎？\n週三下午 · 病假（事由：身體不適）',
      options: ['是，確認送出', '再想想'],
      pick: '是，確認送出',
    },
    {
      kind: 'assistant',
      tools: ['申請假單'],
      text: '已送出 **週三下午的病假** 單，目前狀態：待審核 ⏳',
    },
  ],
  // 2) 查成績 → 表格渲染
  [
    { kind: 'user', text: '幫我看這學期成績' },
    {
      kind: 'assistant',
      tools: ['查詢成績'],
      table: {
        head: ['科目', '成績'],
        rows: [
          ['微積分', '87'],
          ['程式設計', '92'],
          ['線性代數', '80'],
          ['英文', '78'],
        ],
      },
      text: '平均 **84.25** 分，程式設計最高 🎉',
    },
  ],
  // 3) 查課表 → 條列
  [
    { kind: 'user', text: '我禮拜三有什麼課？' },
    {
      kind: 'assistant',
      tools: ['查詢課表'],
      bullets: ['09:10 計算機概論 · 資201', '10:10 微積分 · 理301', '15:10 英文 · 語110'],
      text: '週三共 3 堂，最後一堂 16:00 下課。',
    },
  ],
  // 4) 多工具整合 → 「已使用 N 個工具」面板
  [
    { kind: 'user', text: '幫我整理這學期的修課狀況' },
    {
      kind: 'assistant',
      tools: ['取得學期清單', '查詢課表', '查詢成績'],
      text: '這學期共 **7 門課**、20 學分，目前平均 **85 分**，沒有任何缺曠 ✅',
    },
  ],
]

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export function LandingPreview() {
  const [messages, setMessages] = useState<Msg[]>([])
  const [typed, setTyped] = useState('')
  const [card, setCard] = useState<{ question: string; options: string[]; pick: string; lit: boolean } | null>(null)
  const idRef = useRef(0)

  useEffect(() => {
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

    const nextId = () => ++idRef.current

    if (reduce) {
      // 靜態呈現第一個情境的最終狀態
      setMessages([
        { id: nextId(), role: 'user', text: '我這週缺幾節課？' },
        { id: nextId(), role: 'assistant', tools: [{ name: '查詢缺曠', ok: true }], text: '這週你有 **2 節** 缺曠，都集中在週三下午。要我幫你補請假單嗎？' },
        { id: nextId(), role: 'user', text: '好，幫我請週三下午的病假' },
        { id: nextId(), role: 'user', text: '▶ 是，確認送出' },
        { id: nextId(), role: 'assistant', tools: [{ name: '申請假單', ok: true }], text: '已送出 **週三下午的病假** 單，目前狀態：待審核 ⏳' },
      ])
      return
    }

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
        const id = nextId()
        setMessages((prev) => [...prev, { id, role: 'user', text: step.text }])
        setTyped('')
        await sleep(450)
        return guard()
      }
      if (step.kind === 'confirm') {
        setCard({ question: step.question, options: step.options, pick: step.pick, lit: false })
        await sleep(1600)
        if (guard()) return true
        setCard((c) => (c ? { ...c, lit: true } : c))
        await sleep(850)
        if (guard()) return true
        setCard(null)
        setMessages((prev) => [...prev, { id: nextId(), role: 'user', text: `▶ ${step.pick}` }])
        await sleep(450)
        return guard()
      }
      // assistant
      const id = nextId()
      setMessages((prev) => [...prev, { id, role: 'assistant', tools: step.tools.map((name) => ({ name })) }])
      await sleep(550)
      for (let i = 0; i < step.tools.length; i++) {
        if (guard()) return true
        patch(id, (m) => ({ ...m, tools: m.tools.map((t, ti) => (ti === i ? { ...t, ok: true } : t)) }))
        await sleep(480)
      }
      await sleep(350)
      patch(id, (m) => ({ ...m, text: step.text, table: step.table, bullets: step.bullets }))
      await sleep(2400)
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
  }, [])

  const processing = messages.some((m) => m.role === 'assistant' && m.tools.some((t) => t.ok === undefined))

  return (
    <section className="mx-auto w-full max-w-5xl px-6 py-24">
      <div className="mb-12 text-center">
        <h2 className="font-heading text-3xl font-semibold tracking-wide text-foreground sm:text-4xl">
          用講的，它就幫你做
        </h2>
        <p className="mt-3 text-muted-foreground">
          查課表、看成績、送假單 —— 一句話的事；會改動資料的動作一定先問過你。
        </p>
      </div>

      {/* 瀏覽器外框 */}
      <div className="mx-auto max-w-xl overflow-hidden rounded-2xl bg-card/60 shadow-2xl shadow-black/20 ring-1 ring-border backdrop-blur-md">
        <div className="flex items-center gap-1.5 border-b border-border px-4 py-3">
          <span className="size-3 rounded-full bg-destructive/60" />
          <span className="size-3 rounded-full bg-amber-500/60" />
          <span className="size-3 rounded-full bg-emerald-500/60" />
          <span className="ml-3 inline-flex items-center gap-1.5 truncate text-xs text-muted-foreground">
            <Bot className="size-3.5 text-primary" />
            agora · AI 助理
          </span>
        </div>

        {/* 對話區（固定高度、內容靠底、過長上方裁切如真實捲動） */}
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
                  {m.role === 'user' ? <UserBubble>{m.text}</UserBubble> : <AssistantMessage msg={m} />}
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

          {/* 輸入列：打字機效果 */}
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
          <p className="mt-1.5 text-center text-[10px] text-muted-foreground/50">
            AI 可能會出錯，重要事項請自行確認
          </p>
        </div>
      </div>
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
        <ChevronDown className="size-3 rotate-0" />
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
                <td key={i} className="border-b border-border px-3 py-1.5 text-foreground last:text-right">
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

/** 極簡 **粗體** 渲染（對齊 ChatView 的 markdown 粗體）。 */
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
