import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { requestPasswordReset } from '@/auth/auth-api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function ForgotPassword() {
  const { t } = useTranslation('auth')
  const [email, setEmail] = useState('')
  const [info, setInfo] = useState<{ delay_hours: number; hold_hours: number } | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      setInfo(await requestPasswordReset(email))
    } catch {
      // The same message is shown whatever happens, so nothing is revealed.
      setInfo({ delay_hours: 24, hold_hours: 12 })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className='grid min-h-svh place-items-center p-4'>
      <Card className='w-full max-w-sm'>
        <CardHeader><CardTitle>{t('forgotTitle')}</CardTitle></CardHeader>
        <CardContent className='grid gap-4'>
          <p className='text-sm text-muted-foreground'>{t('forgotBody')}</p>
          {info ? (
            <>
              <p role='status' className='text-sm'>{t('forgotSent')}</p>
              <p className='text-sm text-muted-foreground'>{t('forgotDelay', { hours: info.delay_hours, hold: info.hold_hours })}</p>
            </>
          ) : (
            <form onSubmit={onSubmit} className='grid gap-4'>
              <div className='grid gap-2'>
                <Label htmlFor='fp-email'>{t('email')}</Label>
                <Input id='fp-email' type='email' dir='ltr' value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
              </div>
              <Button type='submit' disabled={busy || !email.includes('@')}>{t('sendRequest')}</Button>
            </form>
          )}
          <Link to='/sign-in' className='text-center text-sm underline-offset-4 hover:underline'>{t('back')}</Link>
        </CardContent>
      </Card>
    </div>
  )
}
