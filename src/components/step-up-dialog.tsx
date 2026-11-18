import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError } from '@/api/types'
import { stepUp } from '@/auth/auth-api'
import { useSession } from '@/auth/session-store'
import { useStepUp } from '@/auth/step-up-store'
import { isSixDigits } from '@/lib/digits'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/** Asks for a fresh authenticator code, then lets the original request retry once. */
export function StepUpDialog() {
  const { t } = useTranslation('auth')
  const open = useStepUp((s) => s.open)
  const settle = useStepUp((s) => s.settle)
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const close = (ok: boolean) => {
    setCode('')
    setError('')
    settle(ok)
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isSixDigits(code)) return setError(t('stepUpInvalid'))
    setBusy(true)
    try {
      await stepUp(code)
      close(true)
    } catch (err) {
      // After five wrong codes the backend ends the session; the client already reacted to it.
      if (err instanceof ApiError && err.code === 'session_inactive') {
        useSession.getState().end('revoked')
        close(false)
      } else {
        setError(t('stepUpInvalid'))
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close(false)}>
      <DialogContent className='sm:max-w-sm'>
        <form onSubmit={submit} className='grid gap-4'>
          <DialogHeader className='text-start'>
            <DialogTitle>{t('stepUpTitle')}</DialogTitle>
            <DialogDescription>{t('stepUpBody')}</DialogDescription>
          </DialogHeader>
          <div className='grid gap-2'>
            <Label htmlFor='stepup-code'>{t('totp')}</Label>
            <Input
              id='stepup-code'
              dir='ltr'
              inputMode='numeric'
              autoComplete='one-time-code'
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoFocus
            />
            <p role='alert' className='min-h-5 text-sm text-destructive'>{error}</p>
          </div>
          <DialogFooter className='gap-2'>
            <Button type='button' variant='outline' onClick={() => close(false)}>
              {t('common:cancel')}
            </Button>
            <Button type='submit' disabled={busy}>{t('common:confirm')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
