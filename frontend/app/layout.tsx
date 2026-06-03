import type { Metadata } from 'next'
import { Geist, Geist_Mono, Huninn, Noto_Sans_TC, Noto_Serif_TC } from 'next/font/google'
import './globals.css'
import { Providers } from './providers'
import { Toaster } from '@/components/ui/sonner'

// 英數內文：Geist Sans（可變字體）
const geistSans = Geist({
  subsets: ['latin'],
  variable: '--font-geist-sans',
})

// 等寬：Geist Mono（程式碼、學號、時間等）
const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-geist-mono',
})

// 中文內文：jf 粉圓（Huninn），圓滑親和。僅單一字重 400，粗體由瀏覽器合成。
// Huninn 不在 next/font 的度量表內，關閉自動 fallback 覆寫以消除 warning。
const huninn = Huninn({
  weight: '400',
  preload: false,
  adjustFontFallback: false,
  fallback: ['PingFang TC', 'Microsoft JhengHei', 'sans-serif'],
  variable: '--font-huninn',
})

// 中文 fallback：Noto Sans TC，補 Huninn 可能缺的字。CJK 不可 preload。
const notoSansTC = Noto_Sans_TC({
  weight: ['400', '500', '700'],
  preload: false,
  variable: '--font-noto-sans-tc',
})

// 標題：Noto Serif TC（思源宋體），中英文皆走襯線，帶優雅對比。同樣不可 preload。
const notoSerifTC = Noto_Serif_TC({
  weight: ['500', '600', '700'],
  preload: false,
  variable: '--font-noto-serif-tc',
})

export const metadata: Metadata = {
  title: 'Agora AI - 學生入口',
  description: '台北城市科技大學學生入口',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="zh-TW"
      className={`h-full antialiased ${geistSans.variable} ${geistMono.variable} ${huninn.variable} ${notoSansTC.variable} ${notoSerifTC.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <Providers>{children}</Providers>
        <Toaster />
      </body>
    </html>
  )
}
