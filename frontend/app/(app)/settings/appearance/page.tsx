'use client'

import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import { Monitor, Moon, Sun, Check } from 'lucide-react'
import { BRAND_PRESETS, getBrand, setBrand, isHex } from '@/lib/brand'
import { Input } from '@/components/ui/input'

const THEME_OPTIONS = [
  { value: 'system', label: '系統', icon: Monitor },
  { value: 'light',  label: '淺色', icon: Sun },
  { value: 'dark',   label: '深色', icon: Moon },
]

export default function AppearanceSettingsPage() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [brand, setBrandState] = useState('')
  const [customHex, setCustomHex] = useState('')

  useEffect(() => {
    setMounted(true)
    setBrandState(getBrand())
  }, [])

  function pick(value: string) {
    setBrand(value)
    setBrandState(value)
    if (!BRAND_PRESETS.some(p => p.value === value)) setCustomHex(value)
  }

  function applyCustom() {
    const v = customHex.trim()
    if (isHex(v)) pick(v)
  }

  const isPreset = BRAND_PRESETS.some(p => p.value === brand)

  return (
    <>
      {/* Theme */}
      <div className="rounded-xl border border-border bg-card/70 p-4 space-y-4 backdrop-blur-xl">
        <div>
          <p className="font-heading text-sm font-semibold text-foreground">主題</p>
          <p className="text-xs text-muted-foreground mt-0.5">選擇介面外觀，預設為深色</p>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {THEME_OPTIONS.map(({ value, label, icon: Icon }) => {
            const active = mounted && theme === value
            return (
              <button key={value} onClick={() => setTheme(value)}
                className={`flex flex-col items-center gap-2 py-4 rounded-lg border transition-colors ${
                  active
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/20'
                }`}>
                <Icon className="w-5 h-5" />
                <span className="text-xs font-medium">{label}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Brand colour */}
      <div className="rounded-xl border border-border bg-card/70 p-4 space-y-4 backdrop-blur-xl">
        <div>
          <p className="font-heading text-sm font-semibold text-foreground">品牌色</p>
          <p className="text-xs text-muted-foreground mt-0.5">主題色彩，套用於按鈕、連結與重點元素</p>
        </div>

        {/* Preset swatches */}
        <div className="flex flex-wrap gap-2.5">
          {BRAND_PRESETS.map(p => {
            const active = mounted && brand === p.value
            const swatch = p.value || '#f97316'  // Orange default
            return (
              <button key={p.name} onClick={() => pick(p.value)} title={p.name}
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-transform hover:scale-110 ${
                  active ? 'ring-2 ring-offset-2 ring-offset-card ring-foreground/40' : ''
                }`}
                style={{ backgroundColor: swatch }}>
                {active && <Check className="w-4 h-4 text-white drop-shadow" />}
              </button>
            )
          })}
        </div>

        {/* Custom hex */}
        <div className="flex items-center gap-2">
          <span
            className="w-8 h-8 rounded-lg border border-border shrink-0"
            style={{ backgroundColor: isHex(customHex) ? customHex : 'transparent' }}
          />
          <Input
            value={customHex}
            onChange={e => setCustomHex(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') applyCustom() }}
            placeholder="#3b82f6"
            className="font-mono text-sm flex-1"
          />
          <button onClick={applyCustom} disabled={!isHex(customHex.trim())}
            className="text-xs px-3 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/80 disabled:opacity-40 transition-colors">
            套用
          </button>
        </div>
        {!isPreset && brand && (
          <p className="text-[11px] text-muted-foreground/60">目前使用自訂色 {brand}</p>
        )}
      </div>
    </>
  )
}
