'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

/**
 * 整頁載入失敗的 fallback：掛載時以 sonner 提示（統一反饋管道），
 * 同時保留持久可見的訊息與「重試」按鈕——整頁無內容時，會自動消失的
 * toast 不足以承載，故兩者並存。由 server component 的 catch 區塊渲染，
 * 401→登入轉址仍由 serverFetch 的 redirect + unstable_rethrow 處理。
 */
export function LoadError({ message = '載入失敗，請重新整理' }: { message?: string }) {
  const router = useRouter()

  useEffect(() => { toast.error(message) }, [message])

  return (
    <div className="flex flex-col items-center gap-3 py-12 text-center">
      <p className="text-sm text-muted-foreground">{message}</p>
      <Button variant="outline" size="sm" onClick={() => router.refresh()}>
        重試
      </Button>
    </div>
  )
}
