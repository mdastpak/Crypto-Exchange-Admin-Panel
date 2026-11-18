import { useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { ApiError } from '@/api/types'
import { login, verify } from '@/auth/auth-api'
import { isSixDigits } from '@/lib/digits'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PasswordInput } from '@/components/password-input'

/**
 * Three factors, always: password, then emailed code and authenticator code.
 * Every failure shows the same sentence, so nobody learns which factor was wrong
 * or whether the address belongs to an administrator.
 */
export function SignIn() {
  const { t } = useTranslation('auth')
  const navigate = useNavigate()
  const [step, setStep] = useState<0 | 1>(0)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [emailCode, setEmailCode] = useState('')
  const [totp, setTotp] = useState('')
  const [challenge, setChallenge] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const fail = (e: unknown) =>
    setError(e instanceof ApiError && e.code === 'rate_limited' ? t('locked') : t('signInFailed'))

  async function onSubmit(ev: React.FormEvent) {
    ev.preventDefault()
    setError('')
    setBusy(true)
    try {
      if (step === 0) {
        if (!email.includes('@') || password.length < 14) return setError(t('signInFailed'))
        const r = await login(email, password)
        setChallenge(r.challenge)
        setStep(1)
      } else {
        if (!isSixDigits(emailCode) || !isSixDigits(totp)) return setError(t('signInFailed'))
        await verify(challenge, emailCode, totp)
        setPassword('')
        await navigate({ to: '/', replace: true })
      }
    } catch (e) {
      fail(e)
      if (step === 1) {
        setStep(0)
        setPassword('')
        setEmailCode('')
        setTotp('')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className='grid min-h-svh place-items-center p-4'>
      <Card className='w-full max-w-sm'>
        <CardHeader>
          <CardTitle>{t('signInTitle')}</CardTitle>
          <p className='text-sm text-muted-foreground'>{t('factors')}</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className='grid gap-4' noValidate>
            {step === 0 ? (
              <>
                <div className='grid gap-2'>
                  <Label htmlFor='email'>{t('email')}</Label>
                  <Input id='email' type='email' dir='ltr' autoComplete='username' value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
                </div>
                <div className='grid gap-2'>
                  <Label htmlFor='password'>{t('password')}</Label>
                  <PasswordInput id='password' dir='ltr' autoComplete='current-password' value={password} onChange={(e) => setPassword(e.target.value)} />
                  <p className='text-xs text-muted-foreground'>{t('passwordHint')}</p>
                </div>
              </>
            ) : (
              <>
                <div className='grid gap-2'>
                  <Label htmlFor='email-code'>{t('emailCode')}</Label>
                  <Input id='email-code' dir='ltr' inputMode='numeric' autoComplete='one-time-code' maxLength={6} value={emailCode} onChange={(e) => setEmailCode(e.target.value)} autoFocus />
                </div>
                <div className='grid gap-2'>
                  <Label htmlFor='totp'>{t('totp')}</Label>
                  <Input id='totp' dir='ltr' inputMode='numeric' autoComplete='off' maxLength={6} value={totp} onChange={(e) => setTotp(e.target.value)} />
                  <p className='text-xs text-muted-foreground'>{t('digitsHint')}</p>
                </div>
              </>
            )}
            <p role='alert' className='min-h-5 text-sm text-destructive'>{error}</p>
            <Button type='submit' disabled={busy}>{step === 0 ? t('common:continue') : t('signIn')}</Button>
            <Link to='/forgot-password' className='text-center text-sm text-muted-foreground underline-offset-4 hover:underline'>
              {t('forgot')}
            </Link>
            <p className='text-xs text-muted-foreground'>{t('policyNote')}</p>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
