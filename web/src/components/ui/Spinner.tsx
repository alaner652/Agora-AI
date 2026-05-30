interface SpinnerProps { className?: string }

export function Spinner({ className = 'w-4 h-4' }: SpinnerProps) {
  return (
    <div className={`border-2 border-stone-600 border-t-orange-400 rounded-full animate-spin ${className}`} />
  )
}
