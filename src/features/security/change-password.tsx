import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { api } from '@/api/client'
import { fieldErrors } from '@/lib/errors'
import { useSession } from '@/auth/session-store'
import { Field } from '@/components/field'
import { PasswordInput } from '@/components/password-input'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

/** Shown when the backend answers `403 password_expired`: nothing else works until the password changes. */
export function ChangePassword() {
  const { t } = useTranslation('security')
  const navigate = useNavigate()
  const [f, setF] = useState({ current: '', next: '', again: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (f.next !== f.again) return setErrors({ again: t('change.mismatch') })
    setBusy(true); setErrors({})
    try {
      await api.post('/admin/auth/password-change', { current_password: f.current, new_password: f.next })
      useSession.getState().setPasswordExpired(false)
      toast.success(t('change.done'))
      await navigate({ to: '/', replace: true })
    } catch (err) {
      const fe = fieldErrors(err)
      setErrors(Object.keys(fe).length ? { next: fe.new_password ?? '' } : { current: t('errors:codes.password_invalid') })
    } finally { setBusy(false) }
  }
  return (
    <div className='grid min-h-svh place-items-center p-4'>
      <Card className='w-full max-w-sm'>
        <CardHeader><CardTitle>{t('change.title')}</CardTitle><p className='text-sm text-muted-foreground'>{t('change.body')}</p></CardHeader>
        <CardContent>
          <form className='grid gap-4' onSubmit={submit}>
            <Field id='cp-cur' label={t('change.current')} error={errors.current}><PasswordInput id='cp-cur' dir='ltr' autoComplete='current-password' value={f.current} onChange={(e) => setF({ ...f, current: e.target.value })} /></Field>
            <Field id='cp-new' label={t('change.next')} error={errors.next}><PasswordInput id='cp-new' dir='ltr' autoComplete='new-password' value={f.next} onChange={(e) => setF({ ...f, next: e.target.value })} /></Field>
            <Field id='cp-again' label={t('change.confirm')} error={errors.again}><PasswordInput id='cp-again' dir='ltr' autoComplete='new-password' value={f.again} onChange={(e) => setF({ ...f, again: e.target.value })} /></Field>
            <Button type='submit' disabled={busy}>{t('change.submit')}</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
