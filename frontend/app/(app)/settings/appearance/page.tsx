'use client'

import { useTheme } from 'next-themes'
import { Moon, Sun } from 'lucide-react'

export default function AppearanceSettingsPage() {
  const { theme, setTheme } = useTheme()

  return (
    <div className="max-w-lg space-y-5">
      <div>
        <h2 className="text-base font-semibold text-foreground">Appearance</h2>
        <p className="text-xs text-muted-foreground mt-0.5">主題與 UI 偏好設定</p>
      </div>

      {/* Theme selector */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">主題</label>
        <div className="flex gap-3">
          <button
            onClick={() => setTheme('light')}
            className={`flex flex-col items-center gap-2 p-3 rounded-xl border transition-colors w-28
              ${theme === 'light'
                ? 'border-primary bg-accent text-primary'
                : 'border-border text-muted-foreground hover:text-foreground hover:bg-accent/50'
              }`}
          >
            <Sun className="w-5 h-5" />
            <span className="text-xs font-medium">淺色</span>
          </button>
          <button
            onClick={() => setTheme('dark')}
            className={`flex flex-col items-center gap-2 p-3 rounded-xl border transition-colors w-28
              ${theme === 'dark'
                ? 'border-primary bg-accent text-primary'
                : 'border-border text-muted-foreground hover:text-foreground hover:bg-accent/50'
              }`}
          >
            <Moon className="w-5 h-5" />
            <span className="text-xs font-medium">深色</span>
          </button>
        </div>
        <p className="text-xs text-muted-foreground">預設為深色模式</p>
      </div>

      <div className="rounded-xl border border-border bg-muted/30 px-4 py-4 text-sm text-muted-foreground space-y-1">
        <p className="font-medium text-foreground text-xs">品牌色</p>
        <div className="flex items-center gap-2 mt-2">
          <div className="w-6 h-6 rounded-full bg-primary" />
          <span className="text-xs">橘色（Orange）</span>
        </div>
      </div>
    </div>
  )
}
