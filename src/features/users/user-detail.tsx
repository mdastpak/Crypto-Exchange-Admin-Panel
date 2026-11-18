import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { api } from '@/api/client'
import type { ActivityEvent, Page, UserProfile, Verification } from '@/api/models'
import { useCan } from '@/auth/permissions'
import { describeError } from '@/lib/errors'
import { AuditLink } from '@/components/audit-link'
import { DataTable, type Column } from '@/components/data-table'
import { DateTime } from '@/components/date-time'
import { Main } from '@/components/layout/main'
import { PageHeader } from '@/components/page-header'
import { ReasonDialog } from '@/components/reason-dialog'
import { StatusPill } from '@/components/status-pill'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { UserLookupPanel } from './lookup-panel'
import { RevealDialog } from './reveal-dialog'
import { kycTone, userTone } from './status'

export function UserDetail({ hk }: { hk: string }) {
  const { t } = useTranslation('users')
  const canReveal = useCan('reveal_pii', 'allow')
  const canVerification = useCan('kyc', 'status')
  const canActivity = useCan('users', 'view')
  const canRestrictions = useCan('restrictions', 'request')
  const [revealing, setRevealing] = useState(false)
  const q = useQuery({ queryKey: ['admin', 'users', hk], queryFn: () => api.get<UserProfile>(`/admin/users/${hk}`) })
  const u = q.data
  return (
    <>
      <PageHeader title={t('title')} />
      <Main>
        <div className='mb-3'><Link to='/users' className='text-sm text-muted-foreground underline-offset-4 hover:underline'>← {t('title')}</Link></div>
        {q.isPending && <Skeleton className='h-40 w-full' />}
        {q.isError && <p role='alert' className='text-destructive'>{describeError(t, q.error)}</p>}
        {u && (
          <div className='grid items-start gap-4 lg:grid-cols-[1fr_22rem]'>
            <Tabs defaultValue='overview'>
              <TabsList>
                <TabsTrigger value='overview'>{t('detail.tabs.overview')}</TabsTrigger>
                {canVerification && <TabsTrigger value='verification'>{t('detail.tabs.verification')}</TabsTrigger>}
                {canActivity && <TabsTrigger value='activity'>{t('detail.tabs.activity')}</TabsTrigger>}
              </TabsList>
              <TabsContent value='overview'>
                <Card><CardContent className='grid gap-3 pt-6 text-sm sm:grid-cols-2'>
                  <div><span className='text-muted-foreground'>{t('cols.user')}: </span><bdi dir='ltr' className='font-mono text-xs'>{u.hk}</bdi></div>
                  <div><span className='text-muted-foreground'>{t('cols.email')}: </span><bdi dir='ltr'>{u.email_masked}</bdi></div>
                  <div><span className='text-muted-foreground'>{t('cols.mobile')}: </span><bdi dir='ltr'>{u.mobile_masked}</bdi></div>
                  <div><span className='text-muted-foreground'>{t('detail.name')}: </span><bdi>{u.name_masked}</bdi></div>
                  <div className='flex items-center gap-2'><span className='text-muted-foreground'>{t('cols.status')}:</span><StatusPill tone={userTone(u.status)}>{t(`status.${u.status}`)}</StatusPill></div>
                  <div className='flex items-center gap-2'><span className='text-muted-foreground'>{t('cols.kyc')}:</span><StatusPill tone={kycTone(u.kyc_state)}>{t(`kyc.${u.kyc_state}`)}</StatusPill></div>
                  <div><span className='text-muted-foreground'>{t('cols.level')}: </span><span className='tabular-nums'>{u.level}</span></div>
                  <div><span className='text-muted-foreground'>{t('detail.country')}: </span>{u.country ?? '—'}</div>
                  <div><span className='text-muted-foreground'>{t('detail.sessions')}: </span>{u.counts.sessions}</div>
                  <div><span className='text-muted-foreground'>{t('detail.restrictions')}: </span>{u.counts.restrictions_active}</div>
                  <div><span className='text-muted-foreground'>{t('cols.created')}: </span><DateTime value={u.created_at} /></div>
                  <div><span className='text-muted-foreground'>{t('cols.lastSignIn')}: </span><DateTime value={u.last_sign_in_at} /></div>
                  {u.security_hold_until && <div className='sm:col-span-2'><span className='text-muted-foreground'>{t('detail.hold')}: </span><DateTime value={u.security_hold_until} /></div>}
                  {u.flags.length > 0 && <div className='flex flex-wrap items-center gap-2 sm:col-span-2'><span className='text-muted-foreground'>{t('detail.flags')}:</span>{u.flags.map((f) => <StatusPill key={f} tone='warn'>{f}</StatusPill>)}</div>}
                  <p className='text-xs text-muted-foreground sm:col-span-2'>{t('detail.maskedNote')}</p>
                  <div className='flex flex-wrap items-center gap-3 sm:col-span-2'>
                    {canReveal && <Button variant='outline' onClick={() => setRevealing(true)}>{t('reveal.button')}</Button>}
                    {canRestrictions && <Link to='/restrictions' search={{ hk: u.hk }} className='text-sm underline-offset-4 hover:underline'>{t('detail.openRestrictions')}</Link>}
                    <AuditLink targetType='user' targetId={u.hk} />
                  </div>
                </CardContent></Card>
              </TabsContent>
              {canVerification && <TabsContent value='verification'><VerificationTab hk={hk} /></TabsContent>}
              {canActivity && <TabsContent value='activity'><ActivityTab hk={hk} /></TabsContent>}
            </Tabs>
            <aside aria-label={t('lookup.title')}><h2 className='mb-2 text-sm font-semibold'>{t('lookup.title')}</h2><UserLookupPanel hk={hk} /></aside>
          </div>
        )}
      </Main>
      {revealing && <RevealDialog hk={hk} onClose={() => setRevealing(false)} />}
    </>
  )
}

function VerificationTab({ hk }: { hk: string }) {
  const { t } = useTranslation('users')
  const qc = useQueryClient()
  const canSet = useCan('kyc', 'approve')
  const [asking, setAsking] = useState(false)
  const [level, setLevel] = useState('1')
  const q = useQuery({ queryKey: ['admin', 'users', hk, 'verification'], queryFn: () => api.get<Verification>(`/admin/users/${hk}/verification`) })
  const set = useMutation({
    mutationFn: (reason: string) => api.post(`/admin/users/${hk}/verification/level`, { level: Number(level), reason }),
    onSuccess: () => { toast.success(t('verification.changed')); setAsking(false); void qc.invalidateQueries({ queryKey: ['admin', 'users'] }) },
    onError: (e) => { setAsking(false); toast.error(describeError(t, e)) },
  })
  const v = q.data
  if (q.isPending) return <Skeleton className='h-32 w-full' />
  if (!v) return <p role='alert' className='text-destructive'>{describeError(t, q.error)}</p>
  return (
    <Card><CardContent className='grid gap-4 pt-6 text-sm'>
      <div className='flex flex-wrap items-center gap-3'>
        <span>{t('verification.level')}: <b className='tabular-nums'>{v.level}</b></span>
        <span className='text-muted-foreground'>{t('verification.allows')}:</span>
        {(['deposit', 'trade', 'withdraw'] as const).map((k) => <StatusPill key={k} tone={v.allows[k] ? 'ok' : 'neutral'}>{t(`verification.${k}`)}</StatusPill>)}
      </div>
      <div>
        <h3 className='mb-1 font-medium'>{t('verification.limits')}</h3>
        {v.limits.length === 0 ? <p className='text-muted-foreground'>{t('verification.noLimits')}</p> : v.limits.map((l) => <div key={l.currency}><bdi dir='ltr'>{l.currency}: {t('verification.daily')} {l.daily} · {t('verification.remaining')} {l.remaining}</bdi></div>)}
      </div>
      <div>
        <h3 className='mb-1 font-medium'>{t('verification.history')}</h3>
        {v.history.length === 0 ? <p className='text-muted-foreground'>{t('verification.noHistory')}</p> : (
          <ul className='grid gap-1'>{v.history.map((h, i) => <li key={i} className='flex flex-wrap gap-2'><span className='tabular-nums'>{h.from} → {h.to}</span><span>{h.reason}</span><bdi dir='ltr' className='text-xs text-muted-foreground'>{h.by}</bdi><DateTime value={h.at} /></li>)}</ul>
        )}
      </div>
      {canSet && (
        <div className='flex flex-wrap items-center gap-2'>
          <Select value={level} onValueChange={setLevel}>
            <SelectTrigger className='w-32' aria-label={t('verification.newLevel')}><SelectValue /></SelectTrigger>
            <SelectContent>{[0, 1, 2, 3].map((l) => <SelectItem key={l} value={String(l)}>{l}</SelectItem>)}</SelectContent>
          </Select>
          <Button variant='outline' onClick={() => setAsking(true)}>{t('verification.set')}</Button>
        </div>
      )}
      {asking && <ReasonDialog open title={t('verification.setTitle')} confirmLabel={t('verification.set')} busy={set.isPending} onCancel={() => setAsking(false)} onConfirm={(r) => set.mutate(r)} />}
    </CardContent></Card>
  )
}

function ActivityTab({ hk }: { hk: string }) {
  const { t } = useTranslation('users')
  const q = useQuery({ queryKey: ['admin', 'users', hk, 'activity'], queryFn: () => api.get<Page<ActivityEvent>>(`/admin/users/${hk}/activity?limit=50`) })
  const columns: Column<ActivityEvent>[] = [
    { key: 't', header: t('activity.time'), cell: (e) => <DateTime value={e.at} /> },
    { key: 'a', header: t('activity.action'), cell: (e) => <bdi dir='ltr' className='font-mono text-xs'>{e.action}</bdi> },
    { key: 'i', header: t('activity.ip'), cell: (e) => <bdi dir='ltr'>{e.ip ?? '—'}</bdi> },
    { key: 'o', header: t('activity.outcome'), cell: (e) => <StatusPill tone={e.outcome === 'success' ? 'ok' : 'warn'}>{e.outcome}</StatusPill> },
  ]
  return <DataTable columns={columns} rows={q.data?.items ?? []} rowKey={(e) => e.id} loading={q.isPending} error={q.isError ? describeError(t, q.error) : undefined} empty={t('activity.empty')} />
}
