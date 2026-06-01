import { cn } from '@/lib/utils'

/** Spinning loader ring. Override size/colour via className (e.g. "w-3 h-3 border-t-red-400"). */
export function Spinner({ className }: { className?: string }) {
  return (
    <div
      data-slot="spinner"
      className={cn('border-2 border-border border-t-primary rounded-full animate-spin w-4 h-4', className)}
    />
  )
}
