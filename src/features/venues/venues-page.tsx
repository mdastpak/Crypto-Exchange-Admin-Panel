import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { api } from '@/api/client'
import type { VenueBalance, VenueHold, VenueState } from '@/api/models'
import { useCan } from '@/auth/permissions'
import { describeError } from '@/lib/errors'
import { DataTable, type Column } from '@/components/data-table'
import { DateTime } from '@/components/date-time'
import { Main } from '@/components/layout/main'
import { PageHeader } from '@/components/page-header'
import { ReasonDialog } from '@/components/reason-dialog'
import { StatusPill, type Tone } from '@/components/status-pill'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

const tone = (r: VenueBalance['routability']): Tone => (r === 'routable' ? 'ok' : r === 'held' ? 'bad' : 'warn')

export function VenuesPage() {
  const { t } = useTranslation('venues')
  const qc = useQueryClient()
  const canClear = useCan('venues', 'approve')
  const [clearing, setClearing] = useState<VenueHold | null>(null)
  const q = useQuery({ queryKey: ['admin', 'venues'], queryFn: () => api.get<VenueState[]>('/admin/venues'), refetchInterval: 15_000 })
  const clear = useMutation({
    mutationFn: ({ h, reason }: { h: VenueHold; reason: string }) => api.post(`/admin/venues/holds/${h.id}/clear`, { reason }),
    onSuccess: () => { toast.success(t('cleared')); setClearing(null); void qc.invalidateQueries({ queryKey: ['admin', 'venues'] }) },
    onError: (e) => { toast.error(describeError(t, e)); setClearing(null); void qc.invalidateQueries({ queryKey: ['admin', 'venues'] }) },
  })
  const cols: Column<VenueBalance>[] = [
    { key: 'a', header: t('cols.asset'), cell: (b) => <bdi dir='ltr' className='font-mono'>{b.asset}</bdi> },
    { key: 'f', header: t('cols.free'), cell: (b) => <bdi dir='ltr' className='tabular-nums'>{b.free}</bdi> },
    { key: 'l', header: t('cols.locked'), cell: (b) => <bdi dir='ltr' className='tabular-nums'>{b.locked}</bdi> },
    { key: 'r', header: t('cols.reserved'), cell: (b) => <bdi dir='ltr' className='tabular-nums'>{b.reserved}</bdi> },
    { key: 'av', header: t('cols.available'), cell: (b) => <bdi dir='ltr' className='tabular-nums'>{b.available}</bdi> },
    { key: 'bk', header: t('cols.booked'), cell: (b) => <bdi dir='ltr' className='tabular-nums'>{b.booked}</bdi> },
    { key: 'd', header: t('cols.difference'), cell: (b) => <bdi dir='ltr' className={`tabular-nums ${b.difference ? 'text-destructive' : ''}`}>{b.difference}</bdi> },
    { key: 's', header: t('cols.state'), cell: (b) => <StatusPill tone={tone(b.routability)}>{t(`routability.${b.routability}`)}</StatusPill> },
  ]
  return (
    <>
      <PageHeader title={t('title')} />
      <Main>
        <p className='mb-4 max-w-2xl text-sm text-muted-foreground'>{t('subtitle')}</p>
        {q.isPending && <Skeleton className='h-40 w-full' />}
        {q.isError && <p role='alert' className='text-destructive'>{describeError(t, q.error)}</p>}
        <div className='grid gap-4'>
          {q.data?.map((v) => (
            <Card key={v.venue}>
              <CardHeader className='flex-row flex-wrap items-center gap-3'>
                <CardTitle className='text-base' dir='ltr'>{v.venue}</CardTitle>
                <span className='text-xs text-muted-foreground'>{t('instruments')}: {v.instruments} · {t('trading')}: {v.trading}</span>
                <div className='ms-auto flex flex-wrap gap-2'>
                  {v.snapshots.map((s) => <StatusPill key={s.kind} tone={s.fresh ? 'ok' : 'warn'}>{s.kind}: {s.fresh ? t('fresh') : t('stale')}</StatusPill>)}
                </div>
              </CardHeader>
              <CardContent className='grid gap-3'>
                {v.snapshots.some((s) => s.failure) && <p className='text-xs text-destructive' dir='ltr'>{v.snapshots.filter((s) => s.failure).map((s) => `${s.kind}: ${s.failure}`).join(' · ')}</p>}
                <DataTable columns={cols} rows={v.balances} rowKey={(b) => b.asset} />
                <div>
                  <h3 className='mb-2 text-sm font-semibold'>{t('holds')}</h3>
                  {v.holds.filter((h) => !h.cleared_at).length === 0 && <p className='text-sm text-muted-foreground'>{t('noHolds')}</p>}
                  {v.holds.filter((h) => !h.cleared_at).map((h) => (
                    <div key={h.id} className='flex flex-wrap items-center gap-3 rounded-md border p-3 text-sm'>
                      <bdi dir='ltr' className='font-mono'>{h.asset}</bdi>
                      <span>{t('reported')}: <bdi dir='ltr' className='tabular-nums'>{h.reported}</bdi></span>
                      <span>{t('booked2')}: <bdi dir='ltr' className='tabular-nums'>{h.booked}</bdi></span>
                      <span className='text-destructive'>{t('cols.difference')}: <bdi dir='ltr' className='tabular-nums'>{h.difference}</bdi></span>
                      <DateTime value={h.detected_at} />
                      {canClear && <Button size='sm' variant='outline' className='ms-auto' onClick={() => setClearing(h)}>{t('clear')}</Button>}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </Main>
      {clearing && <ReasonDialog open title={t('clearTitle', { asset: clearing.asset, venue: clearing.venue })} description={t('clearBody')} confirmLabel={t('clear')} busy={clear.isPending} onCancel={() => setClearing(null)} onConfirm={(reason) => clear.mutate({ h: clearing, reason })} />}
    </>
  )
}
