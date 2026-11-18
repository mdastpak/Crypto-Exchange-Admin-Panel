import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { api } from '@/api/client'
import type { Page, Ticket, TicketStats } from '@/api/models'
import { describeError } from '@/lib/errors'
import { DataTable, type Column } from '@/components/data-table'
import { DateTime } from '@/components/date-time'
import { Main } from '@/components/layout/main'
import { PageHeader } from '@/components/page-header'
import { StatusPill } from '@/components/status-pill'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { priorityTone, slaTone, statusTone } from './tones'

export function TicketsPage() {
  const { t } = useTranslation('tickets')
  const navigate = useNavigate()
  const [status, setStatus] = useState('all')
  const [priority, setPriority] = useState('all')
  const [mine, setMine] = useState(false)
  const stats = useQuery({ queryKey: ['admin', 'tickets', 'stats'], queryFn: () => api.get<TicketStats>('/admin/tickets/stats'), refetchInterval: 60_000 })
  // Listing is a POST so that a user id in a filter never reaches a URL or a log.
  const list = useQueryList({ status, priority, mine })
  const rows = list.data?.items ?? []
  const columns: Column<Ticket>[] = [
    { key: 'id', header: t('cols.id'), cell: (x) => <bdi dir='ltr' className='font-mono text-xs'>{x.id}</bdi> },
    { key: 's', header: t('cols.subject'), cell: (x) => <span className='whitespace-normal'>{x.subject}</span>, className: 'max-w-xs' },
    { key: 'p', header: t('cols.priority'), cell: (x) => <StatusPill tone={priorityTone(x.priority)}>{t(`priority.${x.priority}`)}</StatusPill> },
    { key: 'st', header: t('cols.status'), cell: (x) => <StatusPill tone={statusTone(x.status)}>{t(`status.${x.status}`)}</StatusPill> },
    { key: 'a', header: t('cols.assignee'), cell: (x) => <bdi dir='ltr' className='text-xs'>{x.assignee ?? t('unassigned')}</bdi> },
    { key: 'sla', header: t('cols.sla'), cell: (x) => <StatusPill tone={slaTone(x.sla_state)}>{t(`sla.${x.sla_state}`)}</StatusPill> },
    { key: 'u', header: t('cols.updated'), cell: (x) => <DateTime value={x.updated_at} /> },
  ]
  return (
    <>
      <PageHeader title={t('title')} />
      <Main>
        {stats.data && (
          <div className='mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4'>
            {([['backlog', stats.data.backlog], ['firstResponse', stats.data.first_response_minutes], ['resolution', stats.data.resolution_hours], ['breaches', stats.data.sla_breaches]] as const).map(([k, v]) => (
              <Card key={k}><CardContent className='pt-4'><div className='text-xs text-muted-foreground'>{t(`stats.${k}`)}</div><div className={`text-2xl font-semibold tabular-nums ${k === 'breaches' && v > 0 ? 'text-red-600' : ''}`}>{v}</div></CardContent></Card>
            ))}
          </div>
        )}
        <div className='mb-4 flex flex-wrap items-center gap-3'>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className='w-44' aria-label={t('filters.status')}><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value='all'>{t('common:all')}</SelectItem>{(['open', 'pending_user', 'pending_internal', 'solved', 'closed'] as const).map((s) => <SelectItem key={s} value={s}>{t(`status.${s}`)}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={priority} onValueChange={setPriority}>
            <SelectTrigger className='w-40' aria-label={t('filters.priority')}><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value='all'>{t('common:all')}</SelectItem>{(['low', 'normal', 'high', 'urgent'] as const).map((s) => <SelectItem key={s} value={s}>{t(`priority.${s}`)}</SelectItem>)}</SelectContent>
          </Select>
          <div className='flex items-center gap-2'><Checkbox id='t-mine' checked={mine} onCheckedChange={(v) => setMine(v === true)} /><Label htmlFor='t-mine'>{t('filters.mine')}</Label></div>
        </div>
        <DataTable columns={columns} rows={rows} rowKey={(x) => x.id} loading={list.isPending} error={list.isError ? describeError(t, list.error) : undefined} empty={t('empty')}
          onRowClick={(x) => void navigate({ to: '/tickets/$id', params: { id: x.id } })} />
      </Main>
    </>
  )
}

function useQueryList(f: { status: string; priority: string; mine: boolean }) {
  return useQuery({
    queryKey: ['admin', 'tickets', 'list', f],
    queryFn: () => api.post<Page<Ticket>>('/admin/tickets/query', {
      ...(f.status !== 'all' && { status: f.status }), ...(f.priority !== 'all' && { priority: f.priority }), ...(f.mine && { assignee: 'me' }), limit: 100,
    }),
    refetchInterval: 30_000,
  })
}
