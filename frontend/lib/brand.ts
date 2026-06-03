/**
 * Brand colour — a per-device UI preference stored in localStorage.
 *
 * Applied by overriding the `--primary` family of CSS variables on <html>.
 * An empty value clears the override and falls back to globals.css (Orange).
 */

import { BRAND_STORAGE_KEY as KEY } from '@/constants'

export interface BrandPreset { name: string; value: string }

// value === '' → theme default (Orange from globals.css)
export const BRAND_PRESETS: BrandPreset[] = [
  { name: 'Orange', value: '' },
  { name: 'Blue',   value: '#3b82f6' },
  { name: 'Violet', value: '#8b5cf6' },
  { name: 'Green',  value: '#10b981' },
  { name: 'Pink',   value: '#ec4899' },
  { name: 'Red',    value: '#ef4444' },
]

const COLOR_VARS = ['--primary', '--ring', '--sidebar-primary', '--sidebar-ring']
const FG_VARS = ['--primary-foreground', '--sidebar-primary-foreground']
// accent = subtle brand-tinted surface (hover/active backgrounds)
const ACCENT_VARS = ['--accent', '--sidebar-accent']
const ACCENT_FG_VARS = ['--accent-foreground', '--sidebar-accent-foreground']

export function isHex(v: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(v)
}

/** Pick a readable foreground (near-black/near-white) for a hex background. */
function contrastFg(hex: string): string {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return lum > 0.62 ? '#1a1a1a' : '#ffffff'
}

export function applyBrand(value: string): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  if (isHex(value)) {
    COLOR_VARS.forEach(v => root.style.setProperty(v, value))
    FG_VARS.forEach(v => root.style.setProperty(v, contrastFg(value)))
    // Subtle brand-tinted surface — works on both light & dark backgrounds.
    ACCENT_VARS.forEach(v => root.style.setProperty(v, `color-mix(in srgb, ${value} 14%, transparent)`))
    ACCENT_FG_VARS.forEach(v => root.style.setProperty(v, value))
  } else {
    [...COLOR_VARS, ...FG_VARS, ...ACCENT_VARS, ...ACCENT_FG_VARS].forEach(v => root.style.removeProperty(v))
  }
}

export function getBrand(): string {
  if (typeof window === 'undefined') return ''
  return localStorage.getItem(KEY) ?? ''
}

export function setBrand(value: string): void {
  if (isHex(value)) localStorage.setItem(KEY, value)
  else localStorage.removeItem(KEY)
  applyBrand(value)
}

/** Call once on app load to restore the saved brand colour. */
export function loadBrand(): void {
  applyBrand(getBrand())
}
