import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { api } from '@/api/client'
import type { SmsStatus } from '@/api/models'
import { ApiError } from '@/api/types'
import { useCan } from '@/auth/permissions'
import { describeError, fieldErrors } from '@/lib/errors'
import { DataTable, type Column } from '@/components/data-table'
import { DateTime } from '@/components/date-time'
import { Main } from '@/components/layout/main'
import { PageHeader } from '@/components/page-header'
import { StatusPill } from '@/components/status-pill'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'

type Provider = SmsStatus['providers'][number]

export function SmsPage() {
  const { t } = useTranslation('sms')
  const q = useQuery({ queryKey: ['admin', 'sms'], queryFn: () => api.get<SmsStatus>('/admin/notifications/sms'), refetchInterval: 20_000 })
  const columns: Column<Provider>[] = [
    { key: 'n', header: t('title'), cell: (p) => <bdi dir='ltr' className='font-mono'>{p.name}</bdi> },
    { key: 'h', header: '', cell: (p) => <StatusPill tone={p.healthy ? 'ok' : 'bad'}>{p.healthy ? t('healthy') : t('unhealthy')}</StatusPill> },
    { key: 'b', header: t('breaker'), cell: (p) => <DateTime value={p.breaker_open_until} /> },
    { key: 'a', header: t('accepted'), cell: (p) => <span className='tabular-nums'>{p.accepted}</span> },
    { key: 'e', header: t('errors'), cell: (p) => <span className='tabular-nums'>{p.provider_errors}</span> },
    { key: 'd', header: t('delivered'), cell: (p) => <span className='tabular-nums'>{p.delivered}</span> },
    { key: 'f', header: t('failed'), cell: (p) => <span className='tabular-nums'>{p.failed}</span> },
    { key: 't', header: t('templates'), cell: (p) => <bdi dir='ltr' className='text-xs'>{p.templates.join(', ')}</bdi> },
  ]
  const notConfigured = q.error instanceof ApiError && q.error.code === 'sms_not_configured'
  return (
    <>
      <PageHeader title={t('title')} />
      <Main>
        {q.isPending && <Skeleton className='h-40 w-full' />}
        {q.isError && <p role='alert' className='text-destructive'>{notConfigured ? describeError(t, q.error) : describeError(t, q.error)}</p>}
        {q.data && (
          <div className='grid gap-4'>
            <p className='text-sm text-muted-foreground'>{t('window', { m: q.data.window_minutes })} · {t('reports')}: {q.data.delivery_reports ? '✓' : '—'}</p>
            <DataTable columns={columns} rows={q.data.providers} rowKey={(p) => p.name} />
            <Routing status={q.data} />
          </div>
        )}
      </Main>
    </>
  )
}

function Routing({ status }: { status: SmsStatus }) {
  const { t } = useTranslation('sms')
  const qc = useQueryClient()
  const canEdit = useCan('notifications', 'edit')
  const [mode, setMode] = useState(status.mode)
  const [order, setOrder] = useState<{ name: string; on: boolean }[]>(() => {
    const base = status.order?.length ? status.order : status.effective_order
    const rest = status.providers.map((p) => p.name).filter((n) => !base.includes(n))
    return [...base.map((name) => ({ name, on: true })), ...rest.map((name) => ({ name, on: false }))]
  })
  const [error, setError] = useState('')
  const move = (i: number, d: -1 | 1) => setOrder((p) => { const n = [...p]; const j = i + d; if (j < 0 || j >= n.length) return p; [n[i], n[j]] = [n[j], n[i]]; return n })
  const save = useMutation({
    mutationFn: () => api.put('/admin/notifications/sms', mode === 'auto' ? { mode } : { mode, order: order.filter((o) => o.on).map((o) => o.name) }),
    onSuccess: () => { toast.success(t('saved')); setError(''); void qc.invalidateQueries({ queryKey: ['admin', 'sms'] }) },
    onError: (e) => { const fe = fieldErrors(e); if (fe.order || fe.mode) setError(fe.order ?? fe.mode); else toast.error(describeError(t, e)) },
  })
  return (
    <Card>
      <CardHeader><CardTitle className='text-base'>{t('mode')}</CardTitle></CardHeader>
      <CardContent className='grid gap-4'>
        <div className='flex flex-wrap items-center gap-3'>
          <Select value={mode} onValueChange={(v) => setMode(v as SmsStatus['mode'])} disabled={!canEdit}>
            <SelectTrigger className='w-64' aria-label={t('mode')}><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value='auto'>{t('auto')}</SelectItem><SelectItem value='manual'>{t('manual')}</SelectItem></SelectContent>
          </Select>
          <span className='text-sm text-muted-foreground'>{t('effective')}: <bdi dir='ltr' className='font-mono'>{status.effective_order.join(' → ')}</bdi></span>
        </div>
        {mode === 'manual' && (
          <div className='grid gap-2'>
            <p className='text-sm font-medium'>{t('orderTitle')}</p>
            <p className='text-xs text-muted-foreground'>{t('orderHint')}</p>
            <ol className='grid gap-2'>
              {order.map((o, i) => (
                <li key={o.name} className='flex items-center gap-3 rounded-md border p-2'>
                  <Checkbox id={`sms-${o.name}`} checked={o.on} disabled={!canEdit} onCheckedChange={(v) => setOrder((p) => p.map((x, j) => (j === i ? { ...x, on: v === true } : x)))} />
                  <Label htmlFor={`sms-${o.name}`} className='font-mono' dir='ltr'>{o.name}</Label>
                  {canEdit && <span className='ms-auto flex gap-1'><Button type='button' size='sm' variant='ghost' onClick={() => move(i, -1)} aria-label={t('up')}>↑</Button><Button type='button' size='sm' variant='ghost' onClick={() => move(i, 1)} aria-label={t('down')}>↓</Button></span>}
                </li>
              ))}
            </ol>
          </div>
        )}
        {error && <p role='alert' className='text-sm text-destructive'>{error}</p>}
        {canEdit && <div><Button disabled={save.isPending} onClick={() => save.mutate()}>{t('save')}</Button></div>}
      </CardContent>
    </Card>
  )
}
