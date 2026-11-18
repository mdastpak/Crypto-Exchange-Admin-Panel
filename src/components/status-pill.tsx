import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

export type Tone = 'ok' | 'warn' | 'bad' | 'neutral'

const TONE: Record<Tone, string> = {
  ok: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  warn: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300',
  bad: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
  neutral: 'bg-secondary text-secondary-foreground',
}

/** State shown as text and tone, never as colour alone. */
export function StatusPill({ tone = 'neutral', children, className }: { tone?: Tone; children: React.ReactNode; className?: string }) {
  return <Badge variant='outline' className={cn('border-transparent font-normal', TONE[tone], className)}>{children}</Badge>
}
