import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { api } from '@/api/client'
import type { Payout, PayoutDetail, PayoutStatus } from '@/api/models'
import { useCan } from '@/auth/permissions'
import { describeError, fieldErrors } from '@/lib/errors'
import { DataTable, type Column } from '@/components/data-table'
import { DateTime } from '@/components/date-time'
import { Field } from '@/components/field'
import { Main } from '@/components/layout/main'
import { PageHeader } from '@/components/page-header'
import { StatusPill, type Tone } from '@/components/status-pill'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const tone = (s: PayoutStatus): Tone => (s === 'completed' ? 'ok' : s === 'failed' ? 'bad' : s === 'submitted' ? 'warn' : 'neutral')
const STATUSES: PayoutStatus[] = ['submitted', 'planned', 'completed', 'failed', 'released']

export function PayoutsPage() {
  const { t } = useTranslation('withdrawals')
  const canEdit = useCan('payouts', 'edit')
  const [status, setStatus] = useState<PayoutStatus>('submitted')
  const [open, setOpen] = useState<Payout | null>(null)
  const q = useQuery({ queryKey: ['admin', 'payouts', status], queryFn: () => api.get<Payout[]>(`/admin/payouts?status=${status}&limit=100`), refetchInterval: 20_000 })
  const columns: Column<Payout>[] = [
    { key: 'id', header: t('payout.cols.id'), cell: (p) => <bdi dir='ltr' className='font-mono text-xs'>{p.id}</bdi> },
    { key: 'w', header: t('payout.cols.withdrawal'), cell: (p) => <bdi dir='ltr' className='font-mono text-xs'>{p.withdrawal_id}#{p.seq}</bdi> },
    { key: 'rail', header: t('payout.cols.rail'), cell: (p) => <bdi dir='ltr'>{p.rail}</bdi> },
    { key: 'amt', header: t('payout.cols.amount'), cell: (p) => <bdi dir='ltr' className='tabular-nums'>{p.amount} {p.currency}</bdi> },
    { key: 'dest', header: t('payout.cols.destination'), cell: (p) => <bdi dir='ltr' className='font-mono text-xs'>{p.destination}</bdi> },
    { key: 'sch', header: t('payout.cols.scheduled'), cell: (p) => <DateTime value={p.scheduled_for ?? p.submitted_at} /> },
    { key: 'trk', header: t('payout.cols.tracking'), cell: (p) => <bdi dir='ltr' className='font-mono text-xs'>{p.tracking_id ?? '—'}</bdi> },
    { key: 'st', header: t('payout.cols.status'), cell: (p) => <StatusPill tone={tone(p.status)}>{t(`payout.status.${p.status}`)}</StatusPill> },
    { key: 'act', header: '', cell: (p) => canEdit && ['planned', 'submitted'].includes(p.status) && <Button size='sm' onClick={() => setOpen(p)}>{t('payout.open')}</Button> },
  ]
  return (
    <>
      <PageHeader title={t('payoutsTitle')} />
      <Main>
        <div className='mb-4'>
          <Select value={status} onValueChange={(v) => setStatus(v as PayoutStatus)}>
            <SelectTrigger className='w-52' aria-label={t('statusFilter')}><SelectValue /></SelectTrigger>
            <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{t(`payout.status.${s}`)}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <DataTable columns={columns} rows={q.data ?? []} rowKey={(p) => p.id} loading={q.isPending} error={q.isError ? describeError(t, q.error) : undefined} empty={t('payout.none')} />
      </Main>
      {open && <PayoutDialog id={open.id} onClose={() => setOpen(null)} />}
    </>
  )
}

/** Opening this dialog reads the destination in the clear; the backend audits the read. */
function PayoutDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const { t } = useTranslation('withdrawals')
  const qc = useQueryClient()
  const [mode, setMode] = useState<'complete' | 'fail' | null>(null)
  const [text, setText] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const q = useQuery({ queryKey: ['admin', 'payouts', 'detail', id], queryFn: () => api.get<PayoutDetail>(`/admin/payouts/${id}`), gcTime: 0, staleTime: 0, refetchOnMount: 'always' })
  const submit = useMutation({
    mutationFn: () => (mode === 'complete' ? api.post(`/admin/payouts/${id}/complete`, { tracking_id: text.trim() }) : api.post(`/admin/payouts/${id}/fail`, { reason: text.trim() })),
    onSuccess: () => { toast.success(mode === 'complete' ? t('payout.completed') : t('payout.failed')); void qc.invalidateQueries({ queryKey: ['admin', 'payouts'] }); void qc.invalidateQueries({ queryKey: ['admin', 'withdrawals'] }); onClose() },
    onError: (e) => { const fe = fieldErrors(e); if (Object.keys(fe).length) setErrors(fe); else { toast.error(describeError(t, e)); void qc.invalidateQueries({ queryKey: ['admin', 'payouts'] }); onClose() } },
  })
  const d = q.data
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className='sm:max-w-lg'>
        <DialogHeader className='text-start'>
          <DialogTitle>{t('payout.detailTitle', { id })}</DialogTitle>
          <DialogDescription>{t('payout.auditNote')}</DialogDescription>
        </DialogHeader>
        {q.isError && <p role='alert' className='text-sm text-destructive'>{describeError(t, q.error)}</p>}
        {d && (
          <div className='grid gap-3 text-sm'>
            <div><span className='text-muted-foreground'>{t('payout.cols.amount')}: </span><bdi dir='ltr' className='tabular-nums'>{d.amount} {d.currency}</bdi> <span className='text-muted-foreground'>({d.rail})</span></div>
            <div className='rounded-md border bg-muted/40 p-3'>
              <div className='mb-1 text-xs text-muted-foreground'>{t('payout.destination')}</div>
              <bdi dir='ltr' className='font-mono text-sm break-all select-all'>{d.destination_value}</bdi>
              {d.destination_memo && <div className='mt-1'><span className='text-xs text-muted-foreground'>{t('payout.memo')}: </span><bdi dir='ltr' className='font-mono'>{d.destination_memo}</bdi></div>}
            </div>
            <p className='text-xs text-muted-foreground'>{t('payout.payManually')}</p>
            {mode && (
              <Field id='po-text' label={mode === 'complete' ? t('payout.trackingId') : t('payout.failReason')} error={errors.tracking_id ?? errors.reason}>
                <Input id='po-text' dir={mode === 'complete' ? 'ltr' : 'auto'} value={text} onChange={(e) => setText(e.target.value)} autoFocus />
              </Field>
            )}
          </div>
        )}
        <DialogFooter className='gap-2'>
          {!mode ? (
            <>
              <Button variant='outline' onClick={onClose}>{t('common:close')}</Button>
              <Button variant='outline' disabled={!d} onClick={() => setMode('fail')}>{t('payout.fail')}</Button>
              <Button disabled={!d} onClick={() => setMode('complete')}>{t('payout.complete')}</Button>
            </>
          ) : (
            <>
              <Button variant='outline' onClick={() => { setMode(null); setText(''); setErrors({}) }}>{t('common:back')}</Button>
              <Button variant={mode === 'fail' ? 'destructive' : 'default'} disabled={submit.isPending} onClick={() => submit.mutate()}>{t('common:confirm')}</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
