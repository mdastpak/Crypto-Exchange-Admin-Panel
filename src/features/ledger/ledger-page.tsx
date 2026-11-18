import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { api } from '@/api/client'
import type { DailyRow, HouseAccount, LedgerBalance, LedgerEntry, Page, ReconRun } from '@/api/models'
import { useCan } from '@/auth/permissions'
import { describeError, fieldErrors } from '@/lib/errors'
import { fromLocalInput } from '@/lib/format'
import { DataTable, type Column } from '@/components/data-table'
import { DateTime } from '@/components/date-time'
import { Field } from '@/components/field'
import { Main } from '@/components/layout/main'
import { PageHeader } from '@/components/page-header'
import { StatusPill } from '@/components/status-pill'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

export function LedgerPage() {
  const { t } = useTranslation('ledger')
  return (
    <>
      <PageHeader title={t('title')} />
      <Main>
        <p className='mb-3 text-xs text-muted-foreground'>{t('readOnly')}</p>
        <Tabs defaultValue='balances'>
          <TabsList>{(['balances', 'entries', 'house', 'recon', 'report'] as const).map((k) => <TabsTrigger key={k} value={k}>{t(`tabs.${k}`)}</TabsTrigger>)}</TabsList>
          <TabsContent value='balances'><Balances /></TabsContent>
          <TabsContent value='entries'><Entries /></TabsContent>
          <TabsContent value='house'><House /></TabsContent>
          <TabsContent value='recon'><Recon /></TabsContent>
          <TabsContent value='report'><Report /></TabsContent>
        </Tabs>
      </Main>
    </>
  )
}

/** Queries are POSTs and need a bound, so a filter value never reaches a URL and nothing scans the whole ledger. */
function Balances() {
  const { t } = useTranslation('ledger')
  const [f, setF] = useState({ user: '', currency: '' })
  const [rows, setRows] = useState<LedgerBalance[] | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const run = useMutation({
    mutationFn: () => api.post<Page<LedgerBalance>>('/admin/ledger/balances/query', { ...(f.user.trim() && { user_hk: f.user.trim() }), ...(f.currency.trim() && { currency: f.currency.trim() }), limit: 100 }),
    onSuccess: (r) => { setRows(r.items); setErrors({}) },
    onError: (e) => { const fe = fieldErrors(e); setErrors(Object.keys(fe).length ? { form: t('balances.bound') } : { form: describeError(t, e) }) },
  })
  const columns: Column<LedgerBalance>[] = [
    { key: 'u', header: t('balances.cols.user'), cell: (b) => <bdi dir='ltr' className='font-mono text-xs'>{b.user_hk.slice(0, 8)}…</bdi> },
    { key: 'c', header: t('balances.cols.currency'), cell: (b) => <bdi dir='ltr'>{b.currency}</bdi> },
    { key: 'a', header: t('balances.cols.available'), cell: (b) => <bdi dir='ltr' className='tabular-nums'>{b.available}</bdi> },
    { key: 'l', header: t('balances.cols.locked'), cell: (b) => <bdi dir='ltr' className='tabular-nums'>{b.locked}</bdi> },
    { key: 'p', header: t('balances.cols.pending'), cell: (b) => <bdi dir='ltr' className='tabular-nums'>{b.pending}</bdi> },
    { key: 's', header: t('balances.cols.seal'), cell: (b) => <StatusPill tone={b.verified ? 'ok' : 'bad'}>{b.verified ? t('balances.verified') : t('balances.unverified')}</StatusPill> },
  ]
  return (
    <div className='grid gap-3 pt-3'>
      <form className='flex flex-wrap items-end gap-3' onSubmit={(e) => { e.preventDefault(); run.mutate() }}>
        <Field id='lb-user' label={t('balances.user')} className='w-96 max-w-full'><Input id='lb-user' dir='ltr' value={f.user} onChange={(e) => setF({ ...f, user: e.target.value })} /></Field>
        <Field id='lb-cur' label={t('balances.currency')} className='w-32'><Input id='lb-cur' dir='ltr' value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value })} /></Field>
        <Button type='submit' disabled={run.isPending}>{t('balances.run')}</Button>
      </form>
      {errors.form && <p role='alert' className='text-sm text-destructive'>{errors.form}</p>}
      {rows && <><p className='text-xs text-muted-foreground'>{t('balances.unverifiedNote')}</p><DataTable columns={columns} rows={rows} rowKey={(b) => `${b.user_hk}:${b.currency}`} /></>}
    </div>
  )
}

function Entries() {
  const { t } = useTranslation('ledger')
  const [f, setF] = useState({ user: '', kind: '', reference: '', since: '', until: '' })
  const [rows, setRows] = useState<LedgerEntry[] | null>(null)
  const [cursor, setCursor] = useState<string | undefined>()
  const [error, setError] = useState('')
  const [open, setOpen] = useState<LedgerEntry | null>(null)
  const run = useMutation({
    mutationFn: (after?: string) => api.post<Page<LedgerEntry>>('/admin/ledger/entries/query', {
      ...(f.user.trim() && { user_hk: f.user.trim() }), ...(f.kind.trim() && { kind: f.kind.trim() }), ...(f.reference.trim() && { reference: f.reference.trim() }),
      ...(f.since && { since: fromLocalInput(f.since) }), ...(f.until && { until: fromLocalInput(f.until) }), limit: 50, ...(after && { cursor: after }),
    }),
    onSuccess: (r, after) => { setError(''); setRows((p) => (after ? [...(p ?? []), ...r.items] : r.items)); setCursor(r.next_cursor) },
    onError: (e) => setError(Object.keys(fieldErrors(e)).length ? t('entries.bound') : describeError(t, e)),
  })
  const columns: Column<LedgerEntry>[] = [
    { key: 'i', header: t('entries.cols.id'), cell: (e) => <bdi dir='ltr' className='font-mono text-xs'>{e.id}</bdi> },
    { key: 'k', header: t('entries.cols.kind'), cell: (e) => <bdi dir='ltr'>{e.kind}</bdi> },
    { key: 'r', header: t('entries.cols.reference'), cell: (e) => <bdi dir='ltr' className='font-mono text-xs'>{e.reference}</bdi> },
    { key: 'c', header: t('entries.cols.currency'), cell: (e) => <bdi dir='ltr'>{e.currency}</bdi> },
    { key: 't', header: t('entries.cols.time'), cell: (e) => <DateTime value={e.created_at} /> },
    { key: 'b', header: t('entries.cols.balanced'), cell: (e) => <StatusPill tone={e.balanced ? 'ok' : 'bad'}>{e.balanced ? '✓' : t('entries.unbalanced')}</StatusPill> },
  ]
  return (
    <div className='grid gap-3 pt-3'>
      <form className='grid gap-3 sm:grid-cols-2 lg:grid-cols-3' onSubmit={(e) => { e.preventDefault(); setRows(null); run.mutate(undefined) }}>
        <Field id='le-user' label={t('entries.user')}><Input id='le-user' dir='ltr' value={f.user} onChange={(e) => setF({ ...f, user: e.target.value })} /></Field>
        <Field id='le-kind' label={t('entries.kind')}><Input id='le-kind' dir='ltr' value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })} /></Field>
        <Field id='le-ref' label={t('entries.reference')}><Input id='le-ref' dir='ltr' value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} /></Field>
        <Field id='le-since' label={t('entries.since')}><Input id='le-since' type='datetime-local' dir='ltr' value={f.since} onChange={(e) => setF({ ...f, since: e.target.value })} /></Field>
        <Field id='le-until' label={t('entries.until')}><Input id='le-until' type='datetime-local' dir='ltr' value={f.until} onChange={(e) => setF({ ...f, until: e.target.value })} /></Field>
        <div className='flex items-end'><Button type='submit' disabled={run.isPending}>{t('entries.run')}</Button></div>
      </form>
      {error && <p role='alert' className='text-sm text-destructive'>{error}</p>}
      {rows && <DataTable columns={columns} rows={rows} rowKey={(e) => e.id} hasMore={!!cursor} loadingMore={run.isPending} onLoadMore={() => run.mutate(cursor)} onRowClick={setOpen} />}
      {open && (
        <Dialog open onOpenChange={(o) => !o && setOpen(null)}>
          <DialogContent className='sm:max-w-lg'>
            <DialogHeader className='text-start'><DialogTitle>{t('entries.detail', { id: open.id })}</DialogTitle></DialogHeader>
            <p className='text-xs text-muted-foreground'>{t('entries.idem')}: <bdi dir='ltr' className='font-mono'>{open.idempotency_key}</bdi></p>
            {!open.balanced && <p role='alert' className='rounded-md bg-red-100 p-2 text-sm text-red-900 dark:bg-red-950 dark:text-red-200'>{t('entries.unbalanced')}</p>}
            <table className='w-full text-sm'>
              <thead><tr><th className='p-1 text-start'>{t('entries.account')}</th><th className='p-1 text-start'>{t('entries.amount')} ({open.currency})</th></tr></thead>
              <tbody>{open.postings.map((p, i) => <tr key={i} className='border-t'><td className='p-1' dir='ltr'>{p.account}</td><td className='p-1 tabular-nums' dir='ltr'>{p.amount}</td></tr>)}</tbody>
            </table>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}

function House() {
  const { t } = useTranslation('ledger')
  const q = useQuery({ queryKey: ['admin', 'ledger', 'house'], queryFn: () => api.get<HouseAccount[]>('/admin/ledger/house-accounts') })
  const columns: Column<HouseAccount>[] = [
    { key: 'a', header: t('house.account'), cell: (h) => <bdi dir='ltr' className='font-mono'>{h.account}</bdi> },
    { key: 'c', header: t('house.currency'), cell: (h) => <bdi dir='ltr'>{h.currency}</bdi> },
    { key: 'b', header: t('house.balance'), cell: (h) => <bdi dir='ltr' className='tabular-nums'>{h.balance}</bdi> },
  ]
  return <div className='pt-3'><DataTable columns={columns} rows={q.data ?? []} rowKey={(h) => `${h.account}:${h.currency}`} loading={q.isPending} error={q.isError ? describeError(t, q.error) : undefined} /></div>
}

function Recon() {
  const { t } = useTranslation('ledger')
  const qc = useQueryClient()
  const canRun = useCan('ledger', 'edit')
  const q = useQuery({ queryKey: ['admin', 'ledger', 'recon'], queryFn: () => api.get<Page<ReconRun>>('/admin/ledger/reconciliation/runs?limit=50'), refetchInterval: 5_000 })
  const run = useMutation({ mutationFn: () => api.post('/admin/ledger/reconciliation/run'), onSuccess: () => { toast.success(t('recon.queued')); void qc.invalidateQueries({ queryKey: ['admin', 'ledger', 'recon'] }) }, onError: (e) => toast.error(describeError(t, e)) })
  const columns: Column<ReconRun>[] = [
    { key: 'i', header: 'ID', cell: (r) => <bdi dir='ltr' className='font-mono text-xs'>{r.id}</bdi> },
    { key: 's', header: t('recon.started'), cell: (r) => <DateTime value={r.started_at} /> },
    { key: 'd', header: t('recon.duration'), cell: (r) => <span className='tabular-nums' dir='ltr'>{r.duration_ms}</span> },
    { key: 'r', header: t('recon.result'), cell: (r) => <StatusPill tone={r.result === 'ok' ? 'ok' : r.result === 'running' ? 'neutral' : 'bad'}>{r.result === 'ok' ? t('recon.ok') : r.result === 'running' ? t('recon.running') : t('recon.differencesFound')}</StatusPill> },
    { key: 'x', header: t('recon.differences'), cell: (r) => (r.differences.length ? <bdi dir='ltr'>{r.differences.map((d) => `${d.currency} ${d.amount}`).join(', ')}</bdi> : '—') },
  ]
  return (
    <div className='grid gap-3 pt-3'>
      {canRun && <div><Button onClick={() => run.mutate()} disabled={run.isPending}>{t('recon.run')}</Button></div>}
      <DataTable columns={columns} rows={q.data?.items ?? []} rowKey={(r) => r.id} loading={q.isPending} error={q.isError ? describeError(t, q.error) : undefined} empty={t('recon.none')} />
    </div>
  )
}

function Report() {
  const { t } = useTranslation('ledger')
  const [range, setRange] = useState({ from: '', to: '' })
  const [applied, setApplied] = useState(range)
  const q = useQuery({ queryKey: ['admin', 'ledger', 'report', applied], queryFn: () => api.get<{ items: DailyRow[] }>(`/admin/reports/daily?${new URLSearchParams(Object.entries(applied).filter(([, v]) => v)).toString()}`) })
  const columns: Column<DailyRow>[] = [
    { key: 'd', header: t('report.day'), cell: (r) => <bdi dir='ltr'>{r.day}</bdi> },
    { key: 'c', header: t('report.currency'), cell: (r) => <bdi dir='ltr'>{r.currency}</bdi> },
    { key: 'dep', header: t('report.deposits'), cell: (r) => <bdi dir='ltr' className='tabular-nums'>{r.deposits}</bdi> },
    { key: 'w', header: t('report.withdrawals'), cell: (r) => <bdi dir='ltr' className='tabular-nums'>{r.withdrawals}</bdi> },
    { key: 'f', header: t('report.fees'), cell: (r) => <bdi dir='ltr' className='tabular-nums'>{r.fees}</bdi> },
    { key: 'o', header: t('report.otc'), cell: (r) => <bdi dir='ltr' className='tabular-nums'>{r.otc_volume}</bdi> },
  ]
  return (
    <div className='grid gap-3 pt-3'>
      <form className='flex flex-wrap items-end gap-3' onSubmit={(e) => { e.preventDefault(); setApplied(range) }}>
        <Field id='rp-from' label={t('report.from')}><Input id='rp-from' type='date' dir='ltr' value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} /></Field>
        <Field id='rp-to' label={t('report.to')}><Input id='rp-to' type='date' dir='ltr' value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} /></Field>
        <Button type='submit'>{t('report.run')}</Button>
      </form>
      <DataTable columns={columns} rows={q.data?.items ?? []} rowKey={(r) => `${r.day}:${r.currency}`} loading={q.isPending} error={q.isError ? describeError(t, q.error) : undefined} />
    </div>
  )
}
