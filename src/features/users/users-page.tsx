import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { api } from '@/api/client'
import type { Page, UserRow } from '@/api/models'
import { describeError } from '@/lib/errors'
import { DataTable, type Column } from '@/components/data-table'
import { DateTime } from '@/components/date-time'
import { Field } from '@/components/field'
import { Main } from '@/components/layout/main'
import { PageHeader } from '@/components/page-header'
import { StatusPill } from '@/components/status-pill'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { kycTone, userTone } from './status'

export function UsersPage() {
  const { t } = useTranslation('users')
  const navigate = useNavigate()
  const [f, setF] = useState({ email: '', mobile: '', hk: '', status: 'all', level: 'all' })
  const [rows, setRows] = useState<UserRow[] | null>(null)
  const [cursor, setCursor] = useState<string | undefined>()
  const [needs, setNeeds] = useState(false)
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }))
  // A POST body, never a URL: identifiers must not end up in logs.
  const run = useMutation({
    mutationFn: (after?: string) => api.post<Page<UserRow>>('/admin/users/query', {
      ...(f.email.trim() && { email: f.email.trim() }), ...(f.mobile.trim() && { mobile: f.mobile.trim() }), ...(f.hk.trim() && { hk: f.hk.trim() }),
      ...(f.status !== 'all' && { status: f.status }), ...(f.level !== 'all' && { level: Number(f.level) }), limit: 50, ...(after && { cursor: after }),
    }),
    onSuccess: (r, after) => { setRows((p) => (after ? [...(p ?? []), ...r.items] : r.items)); setCursor(r.next_cursor) },
  })
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const any = f.email.trim() || f.mobile.trim() || f.hk.trim() || f.status !== 'all' || f.level !== 'all'
    setNeeds(!any)
    if (any) { setRows(null); run.mutate(undefined) }
  }
  const columns: Column<UserRow>[] = [
    { key: 'u', header: t('cols.user'), cell: (u) => <bdi dir='ltr' className='font-mono text-xs'>{u.hk.slice(0, 8)}…</bdi> },
    { key: 'e', header: t('cols.email'), cell: (u) => <bdi dir='ltr'>{u.email_masked ?? '—'}</bdi> },
    { key: 'm', header: t('cols.mobile'), cell: (u) => <bdi dir='ltr'>{u.mobile_masked ?? '—'}</bdi> },
    { key: 's', header: t('cols.status'), cell: (u) => <StatusPill tone={userTone(u.status)}>{t(`status.${u.status}`)}</StatusPill> },
    { key: 'l', header: t('cols.level'), cell: (u) => <span className='tabular-nums'>{u.level}</span> },
    { key: 'k', header: t('cols.kyc'), cell: (u) => <StatusPill tone={kycTone(u.kyc_state)}>{t(`kyc.${u.kyc_state}`)}</StatusPill> },
    { key: 'c', header: t('cols.created'), cell: (u) => <DateTime value={u.created_at} /> },
    { key: 'ls', header: t('cols.lastSignIn'), cell: (u) => <DateTime value={u.last_sign_in_at} /> },
  ]
  return (
    <>
      <PageHeader title={t('title')} />
      <Main>
        <p className='mb-3 max-w-2xl text-sm text-muted-foreground'>{t('subtitle')}</p>
        <form className='mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3' onSubmit={submit}>
          <Field id='q-email' label={t('search.email')}><Input id='q-email' dir='ltr' type='email' value={f.email} onChange={(e) => set('email', e.target.value)} /></Field>
          <Field id='q-mobile' label={t('search.mobile')}><Input id='q-mobile' dir='ltr' value={f.mobile} onChange={(e) => set('mobile', e.target.value)} /></Field>
          <Field id='q-hk' label={t('search.hk')}><Input id='q-hk' dir='ltr' value={f.hk} onChange={(e) => set('hk', e.target.value)} /></Field>
          <Field id='q-status' label={t('search.status')}>
            <Select value={f.status} onValueChange={(v) => set('status', v)}>
              <SelectTrigger id='q-status'><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value='all'>{t('common:all')}</SelectItem>{(['ACTIVE', 'SUSPENDED', 'BANNED', 'INACTIVE'] as const).map((s) => <SelectItem key={s} value={s}>{t(`status.${s}`)}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field id='q-level' label={t('search.level')}>
            <Select value={f.level} onValueChange={(v) => set('level', v)}>
              <SelectTrigger id='q-level'><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value='all'>{t('common:all')}</SelectItem>{[0, 1, 2, 3].map((l) => <SelectItem key={l} value={String(l)}>{l}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <div className='flex items-end'><Button type='submit' disabled={run.isPending}>{t('search.run')}</Button></div>
        </form>
        {needs && <p role='alert' className='mb-3 text-sm text-destructive'>{t('search.need')}</p>}
        {(rows || run.isPending || run.isError) && (
          <DataTable columns={columns} rows={rows ?? []} rowKey={(u) => u.hk} loading={run.isPending && !rows} error={run.isError ? describeError(t, run.error) : undefined} empty={t('search.empty')}
            hasMore={!!cursor} loadingMore={run.isPending} onLoadMore={() => run.mutate(cursor)}
            onRowClick={(u) => void navigate({ to: '/users/$hk', params: { hk: u.hk } })} />
        )}
      </Main>
    </>
  )
}
