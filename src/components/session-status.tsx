import { Lock } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { formatClock, useNow } from '@/auth/use-now'
import { useSession } from '@/auth/session-store'
import { staySignedIn } from '@/auth/use-session-guard'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

/** Remaining idle time and step-up time, from the server's own numbers. */
export function SessionStatus() {
  const { t } = useTranslation('session')
  const now = useNow()
  const idleAt = useSession((s) => s.idleExpiresAt)
  const elevatedUntil = useSession((s) => s.elevatedUntil)
  const warnMs = useSession((s) => s.policy?.warnMs ?? 120_000)
  const sealed = useSession((s) => s.seal !== null)
  const idleLeft = idleAt - now
  const elevatedLeft = elevatedUntil - now
  return (
    <div className='flex items-center gap-2 text-xs'>
      {sealed && <span title={t('sealed')} className='text-emerald-700 dark:text-emerald-400'><Lock className='size-4' aria-hidden='true' /><span className='sr-only'>{t('sealed')}</span></span>}
      <Badge variant={idleLeft <= warnMs ? 'destructive' : 'secondary'} className='tabular-nums'>
        {t('idle')}: <span dir='ltr'>{formatClock(idleLeft)}</span>
      </Badge>
      <Badge variant={elevatedLeft > 0 ? 'default' : 'outline'} className='hidden tabular-nums sm:inline-flex'>
        {elevatedLeft > 0 ? (
          <>
            {t('elevated')}: <span dir='ltr'>{formatClock(elevatedLeft)}</span>
          </>
        ) : (
          t('notElevated')
        )}
      </Badge>
    </div>
  )
}

/** Shown during the last minutes of idleness. One real click keeps the session. */
export function IdleWarning() {
  const { t } = useTranslation('session')
  const now = useNow()
  const idleAt = useSession((s) => s.idleExpiresAt)
  const warnMs = useSession((s) => s.policy?.warnMs ?? 120_000)
  const signedIn = useSession((s) => s.token !== null)
  const left = idleAt - now
  const open = signedIn && left > 0 && left <= warnMs
  return (
    <Dialog open={open}>
      <DialogContent showCloseButton={false} className='sm:max-w-sm' onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader className='text-start'>
          <DialogTitle>{t('warnTitle')}</DialogTitle>
          <DialogDescription>{t('warnBody', { time: formatClock(left) })}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={() => void staySignedIn()}>{t('stay')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
