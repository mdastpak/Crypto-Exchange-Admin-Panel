import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useCursorList } from '@/api/use-cursor-list'
import type { AuditEntry } from '@/api/models'
import { describeError } from '@/lib/errors'
import { fromLocalInput } from '@/lib/format'
import { DataTable, type Column } from '@/components/data-table'
import { DateTime } from '@/components/date-time'
import { Main } from '@/components/layout/main'
import { PageHeader } from '@/components/page-header'
import { StatusPill, type Tone } from '@/components/status-pill'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const outcomeTone = (o: AuditEntry['outcome']): Tone => (o === 'success' ? 'ok' : o === 'denied' ? 'bad' : 'warn')
const integrityTone = (i: AuditEntry['integrity']): Tone => (i === 'verified' ? 'ok' : i === 'mismatch' ? 'bad' : 'neutral')

export function AuditPage({ initial }: { initial?: { target_type?: string; target_id?: string } }) {
  const { t } = useTranslation('audit')
  const [draft, setDraft] = useState({ action: '', actor_id: '', target_type: initial?.target_type ?? '', target_id: initial?.target_id ?? '', outcome: 'all', since: '', until: '' })
  const [applied, setApplied] = useState(draft)
  const [open, setOpen] = useState<AuditEntry | null>(null)
  const list = useCursorList<AuditEntry>(['admin', 'audit'], '/admin/audit', {
    action: applied.action || undefined, actor_id: applied.actor_id || undefined, target_type: applied.target_type || undefined, target_id: applied.target_id || undefined,
    outcome: applied.outcome === 'all' ? undefined : applied.outcome, since: fromLocalInput(applied.since), until: fromLocalInput(applied.until), limit: '50',
  })
  const rows = list.data?.pages.flatMap((p) => p.items) ?? []
  const set = (k: keyof typeof draft, v: string) => setDraft((p) => ({ ...p, [k]: v }))
  const columns: Column<AuditEntry>[] = [
    { key: 'time', header: t('cols.time'), cell: (e) => <DateTime value={e.occurred_at} /> },
    { key: 'action', header: t('cols.action'), cell: (e) => <bdi dir='ltr' className='font-mono text-xs'>{e.action}</bdi> },
    { key: 'actor', header: t('cols.actor'), cell: (e) => <bdi dir='ltr' className='text-xs'>{e.actor_id}</bdi> },
    { key: 'target', header: t('cols.target'), cell: (e) => <bdi dir='ltr' className='font-mono text-xs'>{e.target_type ? `${e.target_type}:${e.target_id ?? ''}` : '—'}</bdi> },
    { key: 'outcome', header: t('cols.outcome'), cell: (e) => <StatusPill tone={outcomeTone(e.outcome)}>{t(`outcome.${e.outcome}`)}</StatusPill> },
    { key: 'int', header: t('cols.integrity'), cell: (e) => <StatusPill tone={integrityTone(e.integrity)}>{t(`integrity.${e.integrity}`)}</StatusPill> },
  ]
  return (
    <>
      <PageHeader title={t('title')} />
      <Main>
        <form className='mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4' onSubmit={(e) => { e.preventDefault(); setApplied(draft) }}>
          <Input dir='ltr' aria-label={t('filters.action')} placeholder={t('filters.action')} value={draft.action} onChange={(e) => set('action', e.target.value)} />
          <Input dir='ltr' aria-label={t('filters.actor')} placeholder={t('filters.actor')} value={draft.actor_id} onChange={(e) => set('actor_id', e.target.value)} />
          <Input dir='ltr' aria-label={t('filters.targetType')} placeholder={t('filters.targetType')} value={draft.target_type} onChange={(e) => set('target_type', e.target.value)} />
          <Input dir='ltr' aria-label={t('filters.targetId')} placeholder={t('filters.targetId')} value={draft.target_id} onChange={(e) => set('target_id', e.target.value)} />
          <Select value={draft.outcome} onValueChange={(v) => set('outcome', v)}>
            <SelectTrigger aria-label={t('filters.outcome')}><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value='all'>{t('common:all')}</SelectItem>{(['success', 'failure', 'denied'] as const).map((o) => <SelectItem key={o} value={o}>{t(`outcome.${o}`)}</SelectItem>)}</SelectContent>
          </Select>
          <Input type='datetime-local' dir='ltr' aria-label={t('filters.since')} title={t('filters.since')} value={draft.since} onChange={(e) => set('since', e.target.value)} />
          <Input type='datetime-local' dir='ltr' aria-label={t('filters.until')} title={t('filters.until')} value={draft.until} onChange={(e) => set('until', e.target.value)} />
          <div className='flex gap-2'>
            <Button type='submit'>{t('filters.apply')}</Button>
            <Button type='button' variant='outline' onClick={() => { const c = { action: '', actor_id: '', target_type: '', target_id: '', outcome: 'all', since: '', until: '' }; setDraft(c); setApplied(c) }}>{t('filters.clear')}</Button>
          </div>
        </form>
        <DataTable columns={columns} rows={rows} rowKey={(e) => e.hk} loading={list.isPending} error={list.isError ? describeError(t, list.error) : undefined}
          hasMore={list.hasNextPage} loadingMore={list.isFetchingNextPage} onLoadMore={() => void list.fetchNextPage()} onRowClick={setOpen} />
      </Main>
      {open && <EntryDialog entry={open} onClose={() => setOpen(null)} />}
    </>
  )
}

function EntryDialog({ entry, onClose }: { entry: AuditEntry; onClose: () => void }) {
  const { t } = useTranslation('audit')
  const keys = [...new Set([...Object.keys(entry.changes?.before ?? {}), ...Object.keys(entry.changes?.after ?? {})])]
  const show = (v: unknown) => (v === undefined ? '—' : typeof v === 'string' ? v : JSON.stringify(v))
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className='max-h-[90svh] overflow-y-auto sm:max-w-xl'>
        <DialogHeader className='text-start'><DialogTitle>{t('detail')}</DialogTitle></DialogHeader>
        <dl className='grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm'>
          <dt className='text-muted-foreground'>{t('cols.action')}</dt><dd><bdi dir='ltr' className='font-mono'>{entry.action}</bdi></dd>
          <dt className='text-muted-foreground'>{t('cols.actor')}</dt><dd><bdi dir='ltr'>{entry.actor_id}</bdi></dd>
          <dt className='text-muted-foreground'>{t('cols.time')}</dt><dd><DateTime value={entry.occurred_at} /></dd>
          <dt className='text-muted-foreground'>{t('cols.outcome')}</dt><dd>{t(`outcome.${entry.outcome}`)}{entry.reason ? ` · ${entry.reason}` : ''}</dd>
          <dt className='text-muted-foreground'>{t('ip')}</dt><dd><bdi dir='ltr'>{entry.ip ?? '—'}</bdi></dd>
          <dt className='text-muted-foreground'>{t('requestId')}</dt><dd><bdi dir='ltr' className='font-mono text-xs'>{entry.request_id ?? '—'}</bdi></dd>
          <dt className='text-muted-foreground'>{t('cols.integrity')}</dt><dd>{t(`integrity.${entry.integrity}`)}</dd>
        </dl>
        {keys.length === 0 ? <p className='text-sm text-muted-foreground'>{t('noChanges')}</p> : (
          <div className='overflow-x-auto rounded-md border'>
            <table className='w-full text-sm'>
              <thead><tr className='bg-muted/50 text-start'><th className='p-2 text-start'> </th><th className='p-2 text-start'>{t('before')}</th><th className='p-2 text-start'>{t('after')}</th></tr></thead>
              <tbody>{keys.map((k) => <tr key={k} className='border-t'><td className='p-2 font-mono text-xs' dir='ltr'>{k}</td><td className='p-2' dir='ltr'>{show(entry.changes?.before?.[k])}</td><td className='p-2 font-medium' dir='ltr'>{show(entry.changes?.after?.[k])}</td></tr>)}</tbody>
            </table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
