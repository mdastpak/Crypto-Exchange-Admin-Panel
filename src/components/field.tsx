import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

/** A labelled input with its backend error under it. */
export function Field({ id, label, error, hint, className, children }: {
  id: string
  label: string
  error?: string
  hint?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={cn('grid gap-1.5', className)}>
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && !error && <p className='text-xs text-muted-foreground'>{hint}</p>}
      {error && <p role='alert' id={`${id}-error`} className='text-xs text-destructive'>{error}</p>}
    </div>
  )
}
