import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { api } from '@/api/client'
import type { UserLookup } from '@/api/models'
import { describeError } from '@/lib/errors'
import { DateTime } from '@/components/date-time'
import { StatusPill } from '@/components/status-pill'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { kycTone, userTone } from './status'

/**
 * The cross-area view: a user's level, KYC state, requests, transaction states,
 * and system health, in masked form. The server returns only the blocks that the
 * administrator's grants allow, and this panel draws only the blocks it receives.
 */
export function UserLookupPanel({ hk }: { hk: string }) {
  const { t } = useTranslation('users')
  const q = useQuery({ queryKey: ['admin', 'users', hk, 'lookup'], queryFn: () => api.get<UserLookup>(`/admin/users/${hk}/lookup`), refetchInterval: 30_000 })
  if (q.isPending) return <Skeleton className='h-48 w-full' />
  if (q.isError) return <p role='alert' className='text-sm text-destructive'>{describeError(t, q.error)}</p>
  const d = q.data
  const blocks = [d.user, d.kyc, d.withdrawals, d.transactions, d.requests, d.system_health].filter(Boolean)
  if (blocks.length === 0) return <p className='text-sm text-muted-foreground'>{t('lookup.noAccess')}</p>
  return (
    <div className='grid gap-3'>
      {d.user && (
        <Card><CardContent className='grid gap-1 pt-4 text-sm'>
          <div className='flex flex-wrap items-center gap-2'><bdi dir='ltr'>{d.user.email_masked}</bdi><StatusPill tone={userTone(d.user.status)}>{t(`status.${d.user.status}`)}</StatusPill></div>
          <div className='text-muted-foreground'>{t('lookup.level', { n: d.user.level })} · <bdi dir='ltr'>{d.user.mobile_masked}</bdi></div>
        </CardContent></Card>
      )}
      {d.kyc && (
        <Card><CardHeader className='pb-1'><CardTitle className='text-sm'>{t('lookup.kyc')}</CardTitle></CardHeader>
          <CardContent className='flex flex-wrap items-center gap-2 text-sm'><StatusPill tone={kycTone(d.kyc.state)}>{t(`kyc.${d.kyc.state}`)}</StatusPill><span>{t('lookup.level', { n: d.kyc.level })}</span><DateTime value={d.kyc.last_decision_at} /></CardContent></Card>
      )}
      {d.withdrawals && <ListBlock title={t('lookup.withdrawals')} rows={d.withdrawals.map((w) => ({ id: w.id, left: `${w.amount} ${w.currency}`, status: w.status, at: w.created_at }))} />}
      {d.transactions && <ListBlock title={t('lookup.transactions')} rows={d.transactions.map((x) => ({ id: x.id, left: `${x.kind} · ${x.currency}`, status: x.status, at: x.created_at }))} />}
      {d.requests && <ListBlock title={t('lookup.requests')} rows={d.requests.map((x) => ({ id: x.id, left: x.kind, status: x.status, at: x.created_at }))} />}
      {d.system_health && (
        <Card><CardHeader className='pb-1'><CardTitle className='text-sm'>{t('lookup.health')}</CardTitle></CardHeader>
          <CardContent className='flex flex-wrap gap-2 text-sm'>
            <StatusPill tone={d.system_health.mode === 'open' ? 'ok' : 'warn'}>{d.system_health.mode}</StatusPill>
            {d.system_health.lockdowns.map((l) => <StatusPill key={l} tone='bad'>{l}</StatusPill>)}
            <StatusPill tone={d.system_health.price_engine === 'ok' ? 'ok' : 'warn'}>{t('lookup.priceEngine')}: {t(d.system_health.price_engine === 'ok' ? 'lookup.ok' : 'lookup.degraded')}</StatusPill>
            {d.system_health.venues_stale > 0 && <StatusPill tone='warn'>{t('lookup.venuesStale')}: {d.system_health.venues_stale}</StatusPill>}
          </CardContent></Card>
      )}
    </div>
  )
}

function ListBlock({ title, rows }: { title: string; rows: { id: string; left: string; status: string; at: string }[] }) {
  const { t } = useTranslation('users')
  return (
    <Card>
      <CardHeader className='pb-1'><CardTitle className='text-sm'>{title}</CardTitle></CardHeader>
      <CardContent className='grid gap-1 text-sm'>
        {rows.length === 0 && <span className='text-muted-foreground'>{t('lookup.none')}</span>}
        {rows.map((r) => (
          <div key={r.id} className='flex flex-wrap items-center gap-2'>
            <bdi dir='ltr' className='font-mono text-xs'>{r.id}</bdi><bdi dir='ltr'>{r.left}</bdi><StatusPill>{r.status}</StatusPill><span className='ms-auto text-xs'><DateTime value={r.at} /></span>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
