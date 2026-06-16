'use client'

import { useRouter } from 'next/navigation'
import { clearChatHistory, clearAllSessions } from '@/lib/data'
import { SettingCard, DangerRow } from '@/components/settings/primitives'

export default function AdvancedSettingsPage() {
  const router = useRouter()

  // 清完後刷新 Router Cache，否則切回 /chat 會拿到快取裡的舊對話。
  async function handleClearCurrent() {
    await clearChatHistory()
    router.refresh()
  }

  async function handleClearAll() {
    await clearAllSessions()
    router.refresh()
  }

  return (
    <SettingCard>
      <p className="font-heading text-sm font-semibold text-foreground">資料管理</p>
      <div className="-mt-1">
        <DangerRow
          title="清除當前對話"
          description="僅清除目前的聊天記錄，歷史 Session 不受影響"
          action="清除"
          onConfirm={handleClearCurrent}
        />
        <DangerRow
          title="清除所有會話"
          description="永久刪除所有歷史對話，此操作無法復原"
          action="清除所有"
          onConfirm={handleClearAll}
        />
      </div>
    </SettingCard>
  )
}
