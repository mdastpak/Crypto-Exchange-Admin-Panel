import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { api } from '@/api/client'
import type { PriceOverride } from '@/api/models'
import { useSession } from '@/auth/session-store'
import { useCan } from '@/auth/permissions'
import { describeError } from '@/lib/errors'
import { DataTable, type Column } from '@/components/data-table'
import { DateTime } from '@/components/date-time'
import { StatusPill } from '@/components/status-pill'
import { Button } from '@/components/ui/button'

/** Price overrides, with the two-person approval: you cannot approve your own. */
export function OverridesTable({ market }: { market?: string }) {
  const { t } = useTranslation('markets')
  const qc = useQueryClient()
  const me = useSession((s) => s.me?.email)
  const canEdit = useCan('prices', 'edit')
  const canApprove = useCan('prices', 'approve')
  const q = useQuery({ queryKey: ['admin', 'price-overrides'], queryFn: () => api.get<PriceOverride[]>('/admin/price-overrides'), refetchInterval: 15_000 })
  const done = (msg: string) => { toast.success(msg); void qc.invalidateQueries({ queryKey: ['admin', 'price-overrides'] }) }
  const approve = useMutation({ mutationFn: (id: string) => api.post(`/admin/price-overrides/${id}/approve`), onSuccess: () => done(t('common:saved')), onError: (e) => toast.error(describeError(t, e)) })
  const end = useMutation({ mutationFn: (id: string) => api.post(`/admin/price-overrides/${id}/end`), onSuccess: () => done(t('common:saved')), onError: (e) => toast.error(describeError(t, e)) })
  const rows = (q.data ?? []).filter((o) => !market || o.market === market)
  const state = (o: PriceOverride) => (o.pending ? 'pending' : o.in_force ? 'inForce' : o.lapsed ? 'lapsed' : 'ended')
  const columns: Column<PriceOverride>[] = [
    { key: 'm', header: t('cols.market'), cell: (o) => <bdi dir='ltr' className='font-mono'>{o.market}</bdi> },
    { key: 'p', header: t('override.mid'), cell: (o) => <bdi dir='ltr'>{o.bid} / {o.mid} / {o.ask}</bdi> },
    { key: 'd', header: 'bps', cell: (o) => <span className='tabular-nums' dir='ltr'>{o.deviation_bps ?? '—'}</span> },
    { key: 's', header: t('cols.status'), cell: (o) => <StatusPill tone={o.pending ? 'warn' : o.in_force ? 'ok' : 'neutral'}>{t(`overrideState.${state(o)}`)}</StatusPill> },
    { key: 'r', header: t('override.reason'), cell: (o) => <span className='whitespace-normal'>{o.reason}</span>, className: 'max-w-xs' },
    { key: 'e', header: t('overrideCols.expires'), cell: (o) => <DateTime value={o.pending ? o.approve_by : o.expires_at} /> },
    { key: 'by', header: t('overrideCols.by'), cell: (o) => <bdi dir='ltr'>{o.created_by}</bdi> },
    {
      key: 'a', header: '', cell: (o) => (
        <div className='flex gap-2'>
          {o.pending && canApprove && (
            <Button size='sm' disabled={o.created_by === me || approve.isPending} title={o.created_by === me ? t('overrideCols.ownRequest') : undefined} onClick={() => approve.mutate(o.id)}>{t('overrideCols.approve')}</Button>
          )}
          {(o.pending || o.in_force) && canEdit && <Button size='sm' variant='outline' disabled={end.isPending} onClick={() => end.mutate(o.id)}>{t('overrideCols.end')}</Button>}
        </div>
      ),
    },
  ]
  return <DataTable columns={columns} rows={rows} rowKey={(o) => o.id} loading={q.isPending} error={q.isError ? describeError(t, q.error) : undefined} />
}
