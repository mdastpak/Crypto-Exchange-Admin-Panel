import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { api } from '@/api/client'
import type { Withdrawal, WithdrawalStatus } from '@/api/models'
import { useCan } from '@/auth/permissions'
import { describeError } from '@/lib/errors'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { DataTable, type Column } from '@/components/data-table'
import { DateTime } from '@/components/date-time'
import { Main } from '@/components/layout/main'
import { PageHeader } from '@/components/page-header'
import { ReasonDialog } from '@/components/reason-dialog'
import { StatusPill, type Tone } from '@/components/status-pill'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const withdrawalTone = (s: WithdrawalStatus): Tone => (s === 'review' ? 'warn' : s === 'completed' ? 'ok' : s === 'rejected' || s === 'failed' ? 'bad' : 'neutral')
const STATUSES: WithdrawalStatus[] = ['review', 'queued', 'processing', 'partially_paid', 'completed', 'rejected', 'cancelled', 'failed']

export function WithdrawalsPage() {
  const { t } = useTranslation('withdrawals')
  const qc = useQueryClient()
  const canApprove = useCan('withdrawals', 'approve')
  const [status, setStatus] = useState<WithdrawalStatus>('review')
  const [approving, setApproving] = useState<Withdrawal | null>(null)
  const [rejecting, setRejecting] = useState<Withdrawal | null>(null)
  const q = useQuery({ queryKey: ['admin', 'withdrawals', status], queryFn: () => api.get<Withdrawal[]>(`/admin/withdrawals?status=${status}&limit=100`), refetchInterval: 20_000 })
  const done = (msg: string) => { toast.success(msg); void qc.invalidateQueries({ queryKey: ['admin', 'withdrawals'] }) }
  const fail = (e: unknown) => { toast.error(describeError(t, e)); void qc.invalidateQueries({ queryKey: ['admin', 'withdrawals'] }) }
  const approve = useMutation({ mutationFn: (w: Withdrawal) => api.post(`/admin/withdrawals/${w.id}/approve`), onSuccess: () => { setApproving(null); done(t('approved')) }, onError: (e) => { setApproving(null); fail(e) } })
  const reject = useMutation({ mutationFn: ({ w, reason }: { w: Withdrawal; reason: string }) => api.post(`/admin/withdrawals/${w.id}/reject`, { reason }), onSuccess: () => { setRejecting(null); done(t('rejected')) }, onError: (e) => { setRejecting(null); fail(e) } })

  const columns: Column<Withdrawal>[] = [
    { key: 'id', header: t('cols.id'), cell: (w) => <bdi dir='ltr' className='font-mono text-xs'>{w.id}</bdi> },
    { key: 'user', header: t('cols.user'), cell: (w) => <bdi dir='ltr' className='font-mono text-xs'>{w.user_hk.slice(0, 8)}…</bdi> },
    { key: 'amount', header: t('cols.amount'), cell: (w) => <bdi dir='ltr' className='tabular-nums'>{w.amount} {w.currency}</bdi> },
    { key: 'fee', header: t('cols.fee'), cell: (w) => <bdi dir='ltr' className='tabular-nums'>{w.fee}</bdi> },
    { key: 'dest', header: t('cols.destination'), cell: (w) => <bdi dir='ltr' className='font-mono text-xs'>{w.network}: {w.destination}</bdi> },
    { key: 'reason', header: t('cols.reason'), cell: (w) => (w.review_reason ? t(`reviewReason.${w.review_reason}`) : w.reason ?? '—') },
    { key: 'created', header: t('cols.created'), cell: (w) => <DateTime value={w.created_at} /> },
    { key: 'status', header: t('cols.status'), cell: (w) => <StatusPill tone={withdrawalTone(w.status)}>{t(`status.${w.status}`)}</StatusPill> },
    {
      key: 'act', header: '', cell: (w) => w.status === 'review' && canApprove && (
        <div className='flex gap-2'>
          <Button size='sm' onClick={() => setApproving(w)}>{t('approve')}</Button>
          <Button size='sm' variant='outline' onClick={() => setRejecting(w)}>{t('reject')}</Button>
        </div>
      ),
    },
  ]
  return (
    <>
      <PageHeader title={t('title')} />
      <Main>
        <div className='mb-4 flex items-center gap-3'>
          <Select value={status} onValueChange={(v) => setStatus(v as WithdrawalStatus)}>
            <SelectTrigger className='w-52' aria-label={t('statusFilter')}><SelectValue /></SelectTrigger>
            <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{t(`status.${s}`)}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <DataTable columns={columns} rows={q.data ?? []} rowKey={(w) => w.id} loading={q.isPending} error={q.isError ? describeError(t, q.error) : undefined} empty={t('empty')} />
      </Main>
      {approving && (
        <ConfirmDialog
          open onOpenChange={(o) => !o && setApproving(null)} isLoading={approve.isPending}
          title={t('approveTitle', { id: approving.id })}
          desc={<div className='grid gap-2'><p>{t('approveBody')}</p><p dir='ltr' className='font-mono text-sm'>{t('summary', { amount: approving.amount, currency: approving.currency, destination: `${approving.network}:${approving.destination}` })}</p></div>}
          confirmText={t('approve')} cancelBtnText={t('common:cancel')} handleConfirm={() => approve.mutate(approving)}
        />
      )}
      {rejecting && (
        <ReasonDialog
          open title={t('rejectTitle', { id: rejecting.id })} description={t('rejectBody')} destructive confirmLabel={t('reject')} busy={reject.isPending}
          onCancel={() => setRejecting(null)} onConfirm={(reason) => reject.mutate({ w: rejecting, reason })}
        />
      )}
    </>
  )
}
