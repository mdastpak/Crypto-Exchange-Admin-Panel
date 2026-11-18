import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { api } from '@/api/client'
import type { KycCase } from '@/api/models'
import { useCursorList } from '@/api/use-cursor-list'
import { useCan } from '@/auth/permissions'
import { useSession } from '@/auth/session-store'
import { describeError, fieldErrors } from '@/lib/errors'
import { DataTable, type Column } from '@/components/data-table'
import { DateTime } from '@/components/date-time'
import { Field } from '@/components/field'
import { Main } from '@/components/layout/main'
import { PageHeader } from '@/components/page-header'
import { StatusPill, type Tone } from '@/components/status-pill'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { kycTone } from '../users/status'

const checkTone = (v: string): Tone => (v === 'pass' || v === 'clear' ? 'ok' : v === 'fail' || v === 'match' ? 'bad' : 'warn')
const STATUSES = ['pending', 'in_review', 'needs_info', 'approved', 'rejected'] as const

export function KycPage() {
  const { t } = useTranslation('kyc')
  const [status, setStatus] = useState('all')
  const [mine, setMine] = useState(false)
  const [open, setOpen] = useState<string | null>(null)
  const list = useCursorList<KycCase>(['admin', 'kyc'], '/admin/kyc/cases', { status: status === 'all' ? undefined : status, assigned_to: mine ? 'me' : undefined, limit: '50' })
  const rows = list.data?.pages.flatMap((p) => p.items) ?? []
  const columns: Column<KycCase>[] = [
    { key: 'id', header: t('cols.case'), cell: (c) => <bdi dir='ltr' className='font-mono text-xs'>{c.id}</bdi> },
    { key: 'u', header: t('cols.user'), cell: (c) => <Link to='/users/$hk' params={{ hk: c.user_hk }} className='font-mono text-xs underline-offset-4 hover:underline' dir='ltr' onClick={(e) => e.stopPropagation()}>{c.user_hk.slice(0, 8)}…</Link> },
    { key: 's', header: t('cols.status'), cell: (c) => <StatusPill tone={kycTone(c.status)}>{t(`users:kyc.${c.status}`)}</StatusPill> },
    { key: 'l', header: t('cols.level'), cell: (c) => <span className='tabular-nums'>{c.level_requested}</span> },
    { key: 'a', header: t('cols.assignee'), cell: (c) => <bdi dir='ltr' className='text-xs'>{c.assigned_to ?? '—'}</bdi> },
    { key: 'k', header: t('cols.checks'), cell: (c) => <div className='flex gap-1'>{(Object.entries(c.checks) as [string, string][]).map(([k, v]) => <StatusPill key={k} tone={checkTone(v)} className='text-xs'>{t(`checks.${k}`)}: {t(`checks.${v}`)}</StatusPill>)}</div> },
    { key: 'c', header: t('cols.created'), cell: (c) => <DateTime value={c.created_at} /> },
  ]
  return (
    <>
      <PageHeader title={t('title')} />
      <Main>
        <div className='mb-4 flex flex-wrap items-center gap-4'>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className='w-52' aria-label={t('statusFilter')}><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value='all'>{t('common:all')}</SelectItem>{STATUSES.map((s) => <SelectItem key={s} value={s}>{t(`users:kyc.${s}`)}</SelectItem>)}</SelectContent>
          </Select>
          <div className='flex items-center gap-2'><Checkbox id='mine' checked={mine} onCheckedChange={(v) => setMine(v === true)} /><Label htmlFor='mine'>{t('mine')}</Label></div>
        </div>
        <DataTable columns={columns} rows={rows} rowKey={(c) => c.id} loading={list.isPending} error={list.isError ? describeError(t, list.error) : undefined} empty={t('empty')}
          hasMore={list.hasNextPage} loadingMore={list.isFetchingNextPage} onLoadMore={() => void list.fetchNextPage()} onRowClick={(c) => setOpen(c.id)} />
      </Main>
      {open && <CaseDialog id={open} onClose={() => setOpen(null)} />}
    </>
  )
}

function CaseDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const { t } = useTranslation('kyc')
  const qc = useQueryClient()
  const me = useSession((s) => s.me?.email)
  const canDecide = useCan('kyc', 'approve')
  const canDocs = useCan('kyc_documents', 'allow')
  const [docNote, setDocNote] = useState('')
  const [decision, setDecision] = useState<'approve' | 'reject' | 'needs_info'>('approve')
  const [level, setLevel] = useState('1')
  const [reason, setReason] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const q = useQuery({ queryKey: ['admin', 'kyc', 'case', id], queryFn: () => api.get<KycCase>(`/admin/kyc/cases/${id}`), gcTime: 0 })
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['admin', 'kyc'] }); void qc.invalidateQueries({ queryKey: ['admin', 'users'] }) }
  const claim = useMutation({ mutationFn: () => api.post(`/admin/kyc/cases/${id}/claim`), onSuccess: () => { toast.success(t('claimed')); refresh() }, onError: (e) => toast.error(describeError(t, e)) })
  const view = useMutation({
    mutationFn: (doc: string) => api.get<{ note: string; expires_at: string }>(`/admin/kyc/cases/${id}/documents/${doc}`),
    onSuccess: (r) => setDocNote(r.note), onError: (e) => toast.error(describeError(t, e)),
  })
  const decide = useMutation({
    mutationFn: () => api.post(`/admin/kyc/cases/${id}/decision`, { decision, reason: reason.trim(), ...(decision === 'approve' && { level: Number(level) }) }),
    onSuccess: () => { toast.success(t('decision.done')); refresh(); onClose() },
    onError: (e) => { const fe = fieldErrors(e); if (Object.keys(fe).length) setErrors(fe); else toast.error(describeError(t, e)) },
  })
  const c = q.data
  const closed = c && ['approved', 'rejected'].includes(c.status)
  const mineCase = c?.assigned_to === me
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className='max-h-[90svh] overflow-y-auto sm:max-w-xl'>
        <DialogHeader className='text-start'><DialogTitle>{t('caseTitle', { id })}</DialogTitle></DialogHeader>
        {q.isError && <p role='alert' className='text-destructive'>{describeError(t, q.error)}</p>}
        {c && (
          <div className='grid gap-4 text-sm'>
            <div className='flex flex-wrap items-center gap-2'>
              <StatusPill tone={kycTone(c.status)}>{t(`users:kyc.${c.status}`)}</StatusPill>
              {c.assigned_to ? <span>{t('assignedTo', { who: c.assigned_to })}</span> : canDecide && <Button size='sm' onClick={() => claim.mutate()} disabled={claim.isPending}>{t('claim')}</Button>}
            </div>
            <div className='flex flex-wrap gap-2'>{(Object.entries(c.checks) as [string, string][]).map(([k, v]) => <StatusPill key={k} tone={checkTone(v)}>{t(`checks.${k}`)}: {t(`checks.${v}`)}</StatusPill>)}</div>
            {c.checks.sanctions === 'match' && <p role='alert' className='rounded-md bg-red-100 p-2 text-red-900 dark:bg-red-950 dark:text-red-200'>{t('sanctionsMatch')}</p>}
            <div>
              <h3 className='mb-1 font-medium'>{t('documents')}</h3>
              <p className='mb-2 text-xs text-muted-foreground'>{t('viewNote')}</p>
              <ul className='grid gap-1'>{c.documents?.map((d) => (
                <li key={d.id} className='flex items-center gap-2'><bdi dir='ltr' className='font-mono text-xs'>{d.kind}</bdi><bdi dir='ltr'>{d.name}</bdi>
                  {canDocs ? <Button size='sm' variant='outline' className='ms-auto' onClick={() => view.mutate(d.id)}>{t('view')}</Button> : <span className='ms-auto text-xs text-muted-foreground'>{t('viewNoAccess')}</span>}</li>
              ))}</ul>
              {docNote && <p role='status' className='mt-2 text-xs text-muted-foreground'>{docNote}</p>}
            </div>
            {!!c.notes?.length && <div><h3 className='mb-1 font-medium'>{t('notes')}</h3>{c.notes.map((n, i) => <p key={i} className='text-xs'><bdi dir='ltr'>{n.by}</bdi>: {n.text}</p>)}</div>}
            {canDecide && !closed && (
              <form className='grid gap-3 border-t pt-3' onSubmit={(e) => { e.preventDefault(); setErrors({}); decide.mutate() }}>
                <h3 className='font-medium'>{t('decision.title')}</h3>
                {!mineCase && <p className='text-xs text-muted-foreground'>{t('claimFirst')}</p>}
                <div className='grid gap-3 sm:grid-cols-2'>
                  <Field id='kd' label={t('decision.title')} error={errors.decision}>
                    <Select value={decision} onValueChange={(v) => setDecision(v as typeof decision)}>
                      <SelectTrigger id='kd'><SelectValue /></SelectTrigger>
                      <SelectContent>{(['approve', 'reject', 'needs_info'] as const).map((d) => <SelectItem key={d} value={d}>{t(`decision.${d}`)}</SelectItem>)}</SelectContent>
                    </Select>
                  </Field>
                  {decision === 'approve' && <Field id='kl' label={t('decision.level')} error={errors.level}><Input id='kl' dir='ltr' inputMode='numeric' value={level} onChange={(e) => setLevel(e.target.value)} /></Field>}
                </div>
                <Field id='kr' label={t('decision.reason')} error={errors.reason}><Input id='kr' maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
                <div><Button type='submit' disabled={!mineCase || decide.isPending}>{t('decision.submit')}</Button></div>
              </form>
            )}
            {closed && <p className='text-muted-foreground'>{t('decision.closed')}</p>}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
