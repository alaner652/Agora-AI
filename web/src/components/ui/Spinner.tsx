interface SpinnerProps { className?: string }

export function Spinner({ className = 'w-4 h-4' }: SpinnerProps) {
  return (
    <div className={`border-2 border-zinc-700 border-t-orange-500 rounded-full animate-spin ${className}`} />
  )
}
