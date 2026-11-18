import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { api } from '@/api/client'
import { RESTRICTION_OPERATIONS, RESTRICTION_REASONS, type Restriction, type RestrictionOperation, type RestrictionReason, type RestrictionScope } from '@/api/models'
import { useCan } from '@/auth/permissions'
import { describeError, fieldErrors } from '@/lib/errors'
import { fromLocalInput } from '@/lib/format'
import { DataTable, type Column } from '@/components/data-table'
import { DateTime } from '@/components/date-time'
import { Field } from '@/components/field'
import { Main } from '@/components/layout/main'
import { PageHeader } from '@/components/page-header'
import { ReasonDialog } from '@/components/reason-dialog'
import { StatusPill } from '@/components/status-pill'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const stateOf = (r: Restriction) => (r.lifted_at ? 'lifted' : !r.active ? 'ended' : 'active')

export function RestrictionsPage({ initialHk }: { initialHk?: string }) {
  const { t } = useTranslation('restrictions')
  const qc = useQueryClient()
  const canEdit = useCan('restrictions', 'edit')
  const [input, setInput] = useState(initialHk ?? '')
  const [hk, setHk] = useState(initialHk && UUID.test(initialHk) ? initialHk.toLowerCase() : '')
  const [creating, setCreating] = useState(false)
  const [lifting, setLifting] = useState<Restriction | null>(null)
  const valid = UUID.test(input.trim())
  const q = useQuery({ queryKey: ['admin', 'restrictions', hk], queryFn: () => api.get<{ items: Restriction[] }>(`/admin/users/${hk}/restrictions`), enabled: !!hk })
  const lift = useMutation({
    mutationFn: ({ r, note }: { r: Restriction; note: string }) => api.post(`/admin/users/${hk}/restrictions/${r.id}/lift?version=${r.version}`, { note }),
    onSuccess: () => { toast.success(t('lifted')); setLifting(null); void qc.invalidateQueries({ queryKey: ['admin', 'restrictions'] }) },
    onError: (e) => { toast.error(describeError(t, e)); setLifting(null); void qc.invalidateQueries({ queryKey: ['admin', 'restrictions'] }) },
  })
  const columns: Column<Restriction>[] = [
    { key: 'scope', header: t('cols.scope'), cell: (r) => t(`scope.${r.scope}`) },
    { key: 'ops', header: t('cols.operations'), cell: (r) => (r.operations?.length ? r.operations.map((o) => t(`ops.${o}`)).join('، ') : '—') },
    { key: 'reason', header: t('cols.reason'), cell: (r) => <div><div>{t(`reason.${r.reason}`)}</div>{r.case_ref && <bdi dir='ltr' className='font-mono text-xs text-muted-foreground'>{r.case_ref}</bdi>}</div> },
    { key: 'by', header: t('cols.by'), cell: (r) => <bdi dir='ltr' className='text-xs'>{r.created_by}</bdi> },
    { key: 'created', header: t('cols.created'), cell: (r) => <DateTime value={r.created_at} /> },
    { key: 'ends', header: t('cols.ends'), cell: (r) => <DateTime value={r.ends_at} /> },
    { key: 'state', header: t('cols.state'), cell: (r) => { const s = stateOf(r); return <StatusPill tone={s === 'active' ? 'bad' : 'neutral'}>{t(`state.${s}`)}</StatusPill> } },
    { key: 'act', header: '', cell: (r) => canEdit && r.active && <Button size='sm' variant='outline' onClick={() => setLifting(r)}>{t('lift')}</Button> },
  ]
  return (
    <>
      <PageHeader title={t('title')} />
      <Main>
        <p className='mb-3 max-w-2xl text-sm text-muted-foreground'>{t('subtitle')} {t('internalNote')}</p>
        <form className='mb-4 flex flex-wrap items-end gap-3' onSubmit={(e) => { e.preventDefault(); if (valid) setHk(input.trim().toLowerCase()) }}>
          <Field id='r-hk' label={t('userHk')} className='w-96 max-w-full'><Input id='r-hk' dir='ltr' value={input} onChange={(e) => setInput(e.target.value)} placeholder='xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx' /></Field>
          <Button type='submit' disabled={!valid}>{t('load')}</Button>
          {hk && canEdit && <Button type='button' variant='destructive' className='ms-auto' onClick={() => setCreating(true)}>{t('new')}</Button>}
        </form>
        {hk && <DataTable columns={columns} rows={q.data?.items ?? []} rowKey={(r) => r.id} loading={q.isPending} error={q.isError ? describeError(t, q.error) : undefined} empty={t('empty')} />}
      </Main>
      {creating && <RestrictionDialog hk={hk} onClose={() => setCreating(false)} />}
      {lifting && <ReasonDialog open title={t('liftTitle')} confirmLabel={t('lift')} busy={lift.isPending} onCancel={() => setLifting(null)} onConfirm={(note) => lift.mutate({ r: lifting, note })} />}
    </>
  )
}

function RestrictionDialog({ hk, onClose }: { hk: string; onClose: () => void }) {
  const { t } = useTranslation('restrictions')
  const qc = useQueryClient()
  const [scope, setScope] = useState<RestrictionScope>('operation')
  const [ops, setOps] = useState<RestrictionOperation[]>([])
  const [f, setF] = useState({ reason: 'aml_review' as RestrictionReason, currency: '', caseRef: '', note: '', ends: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }))
  const save = useMutation({
    mutationFn: () => api.post<{ ended_sessions: number }>(`/admin/users/${hk}/restrictions`, {
      scope, ...(scope !== 'account' && { operations: ops }), ...(scope === 'asset' && { currency_hk: f.currency.trim() }),
      reason: f.reason, ...(f.caseRef && { case_ref: f.caseRef }), ...(f.note && { note: f.note }), ...(f.ends && { ends_at: fromLocalInput(f.ends) }),
    }),
    onSuccess: (r) => { toast.success(scope === 'account' ? t('form.createdFreeze', { n: r.ended_sessions }) : t('form.created')); void qc.invalidateQueries({ queryKey: ['admin', 'restrictions'] }); onClose() },
    onError: (e) => { const fe = fieldErrors(e); if (Object.keys(fe).length) setErrors(fe); else toast.error(describeError(t, e)) },
  })
  const toggle = (o: RestrictionOperation) => setOps((p) => (p.includes(o) ? p.filter((x) => x !== o) : [...p, o]))
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className='max-h-[90svh] overflow-y-auto sm:max-w-lg'>
        <form className='grid gap-4' onSubmit={(e) => { e.preventDefault(); setErrors({}); save.mutate() }}>
          <DialogHeader className='text-start'>
            <DialogTitle>{t('form.title')}</DialogTitle>
            {scope === 'account' && <DialogDescription className='text-destructive'>{t('form.freezeWarn')}</DialogDescription>}
          </DialogHeader>
          <div className='grid gap-4 sm:grid-cols-2'>
            <Field id='rs-scope' label={t('form.scope')} error={errors.scope}>
              <Select value={scope} onValueChange={(v) => setScope(v as RestrictionScope)}>
                <SelectTrigger id='rs-scope'><SelectValue /></SelectTrigger>
                <SelectContent>{(['operation', 'asset', 'account'] as const).map((s) => <SelectItem key={s} value={s}>{t(`scope.${s}`)}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field id='rs-reason' label={t('form.reason')} error={errors.reason}>
              <Select value={f.reason} onValueChange={(v) => set('reason', v as RestrictionReason)}>
                <SelectTrigger id='rs-reason'><SelectValue /></SelectTrigger>
                <SelectContent>{RESTRICTION_REASONS.map((r) => <SelectItem key={r} value={r}>{t(`reason.${r}`)}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          </div>
          {scope !== 'account' && (
            <fieldset className='grid gap-2'>
              <legend className='mb-1 text-sm font-medium'>{t('form.operations')}</legend>
              <div className='flex flex-wrap gap-4'>
                {RESTRICTION_OPERATIONS.map((o) => <div key={o} className='flex items-center gap-2'><Checkbox id={`op-${o}`} checked={ops.includes(o)} onCheckedChange={() => toggle(o)} /><Label htmlFor={`op-${o}`}>{t(`ops.${o}`)}</Label></div>)}
              </div>
              {errors.operations && <p role='alert' className='text-xs text-destructive'>{errors.operations}</p>}
            </fieldset>
          )}
          {scope === 'asset' && <Field id='rs-cur' label={t('form.currency')} error={errors.currency_hk}><Input id='rs-cur' dir='ltr' value={f.currency} onChange={(e) => set('currency', e.target.value)} /></Field>}
          <div className='grid gap-4 sm:grid-cols-2'>
            <Field id='rs-case' label={t('form.caseRef')} error={errors.case_ref}><Input id='rs-case' dir='ltr' maxLength={64} value={f.caseRef} onChange={(e) => set('caseRef', e.target.value)} /></Field>
            <Field id='rs-ends' label={t('form.ends')} error={errors.ends_at}><Input id='rs-ends' type='datetime-local' dir='ltr' value={f.ends} onChange={(e) => set('ends', e.target.value)} /></Field>
          </div>
          <Field id='rs-note' label={t('form.note')} error={errors.note}><Input id='rs-note' maxLength={1000} value={f.note} onChange={(e) => set('note', e.target.value)} /></Field>
          <DialogFooter className='gap-2'>
            <Button type='button' variant='outline' onClick={onClose}>{t('common:cancel')}</Button>
            <Button type='submit' variant='destructive' disabled={save.isPending}>{t('common:save')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
