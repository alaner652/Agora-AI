'use client'

import { useEffect, useState } from 'react'
import { QueryClient, QueryClientProvider, QueryCache, MutationCache } from '@tanstack/react-query'
import { toast } from 'sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ThemeProvider } from 'next-themes'
import { MotionConfig } from 'framer-motion'
import { loadBrand } from '@/lib/brand'
import { isAuthError, errorMessage } from '@/lib/api-error'
import { useAuthStore } from '@/lib/stores/auth'

/** 所有 query/mutation 錯誤的單一出口：auth 類導回登入，其餘跳 toast。 */
function handleQueryError(err: unknown) {
  if (isAuthError(err)) {
    useAuthStore.getState().sessionExpired()
    return
  }
  toast.error(errorMessage(err))
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    queryCache: new QueryCache({ onError: handleQueryError }),
    mutationCache: new MutationCache({ onError: handleQueryError }),
  }))
  useEffect(() => { loadBrand() }, [])
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
      {/* MotionConfig reducedMotion="user"：全站尊重系統「減少動態」偏好。 */}
      <MotionConfig reducedMotion="user">
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            {children}
          </TooltipProvider>
        </QueryClientProvider>
      </MotionConfig>
    </ThemeProvider>
  )
}
