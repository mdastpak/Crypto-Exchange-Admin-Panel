import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { api } from '@/api/client'
import type { SecurityPolicy } from '@/api/models'
import { useCan } from '@/auth/permissions'
import { describeError, fieldErrors } from '@/lib/errors'
import { Field } from '@/components/field'
import { Main } from '@/components/layout/main'
import { PageHeader } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'

const PASSWORD_KEYS = ['min_length', 'max_age_days', 'reset_delay_hours', 'post_reset_hold_hours'] as const
const SESSION_KEYS = ['idle_minutes', 'absolute_hours', 'access_token_minutes', 'max_per_admin', 'step_up_minutes'] as const

export function SecurityPage() {
  const { t } = useTranslation('security')
  const q = useQuery({ queryKey: ['admin', 'security', 'policy'], queryFn: () => api.get<SecurityPolicy>('/admin/security/policy') })
  return (
    <>
      <PageHeader title={t('title')} />
      <Main>
        {q.isPending && <Skeleton className='h-48 w-full' />}
        {q.isError && <p role='alert' className='text-destructive'>{describeError(t, q.error)}</p>}
        {q.data && <PolicyForm key={q.data.version} policy={q.data} />}
      </Main>
    </>
  )
}

function PolicyForm({ policy }: { policy: SecurityPolicy }) {
  const { t } = useTranslation('security')
  const qc = useQueryClient()
  const canManage = useCan('security', 'manage')
  const [pw, setPw] = useState(() => Object.fromEntries(PASSWORD_KEYS.map((k) => [k, String(policy.password[k])])))
  const [ss, setSs] = useState(() => Object.fromEntries(SESSION_KEYS.map((k) => [k, String(policy.session[k])])))
  const [reason, setReason] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const save = useMutation({
    mutationFn: () => api.put('/admin/security/policy', {
      password: Object.fromEntries(PASSWORD_KEYS.map((k) => [k, Number(pw[k])])), session: Object.fromEntries(SESSION_KEYS.map((k) => [k, Number(ss[k])])), reason: reason.trim(),
    }),
    onSuccess: () => { toast.success(t('submitted')); setReason(''); void qc.invalidateQueries({ queryKey: ['admin', 'access', 'changes'] }) },
    onError: (e) => { const fe = fieldErrors(e); if (Object.keys(fe).length) setErrors(fe); else toast.error(describeError(t, e)) },
  })
  const field = (group: 'password' | 'session', k: string, value: string, set: (v: string) => void) => (
    <Field key={k} id={`${group}-${k}`} label={t(`${group}.${k}`)} error={errors[`${group}.${k}`]}>
      <Input id={`${group}-${k}`} dir='ltr' inputMode='numeric' readOnly={!canManage} value={value} onChange={(e) => set(e.target.value)} />
    </Field>
  )
  return (
    <form className='grid max-w-3xl gap-4' onSubmit={(e) => { e.preventDefault(); setErrors({}); save.mutate() }}>
      <p className='text-sm text-muted-foreground'>{t('note')} <Badge variant='secondary'>{t('version', { n: policy.version })}</Badge></p>
      <Card>
        <CardHeader><CardTitle className='text-base'>{t('password.title')}</CardTitle></CardHeader>
        <CardContent className='grid gap-4 sm:grid-cols-2'>
          {PASSWORD_KEYS.map((k) => field('password', k, pw[k], (v) => setPw((p) => ({ ...p, [k]: v }))))}
          {Number(pw.reset_delay_hours) === 0 && <p role='alert' className='text-sm text-amber-700 sm:col-span-2 dark:text-amber-400'>{t('password.zeroDelay')}</p>}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className='text-base'>{t('session.title')}</CardTitle></CardHeader>
        <CardContent className='grid gap-4 sm:grid-cols-2'>{SESSION_KEYS.map((k) => field('session', k, ss[k], (v) => setSs((p) => ({ ...p, [k]: v }))))}</CardContent>
      </Card>
      {canManage && (
        <>
          <Field id='policy-reason' label={t('reason')} error={errors.reason}><Input id='policy-reason' maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
          <div><Button type='submit' disabled={save.isPending || !reason.trim()}>{t('submit')}</Button></div>
        </>
      )}
    </form>
  )
}
