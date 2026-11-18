import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { api } from '@/api/client'
import type { IntegrityFinding } from '@/api/models'
import { useCursorList } from '@/api/use-cursor-list'
import { useCan } from '@/auth/permissions'
import { useSession } from '@/auth/session-store'
import { describeError } from '@/lib/errors'
import { DataTable, type Column } from '@/components/data-table'
import { DateTime } from '@/components/date-time'
import { Main } from '@/components/layout/main'
import { PageHeader } from '@/components/page-header'
import { ReasonDialog } from '@/components/reason-dialog'
import { StatusPill } from '@/components/status-pill'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'

const stateOf = (f: IntegrityFinding) => (f.resolution ? 'resolved' : f.reseal_requested_by ? 'requested' : 'open')

export function IntegrityPage() {
  const { t } = useTranslation('integrity')
  const qc = useQueryClient()
  const me = useSession((s) => s.me?.email)
  const canApprove = useCan('integrity', 'approve')
  const [all, setAll] = useState(false)
  const [acting, setActing] = useState<IntegrityFinding | null>(null)
  const list = useCursorList<IntegrityFinding>(['admin', 'integrity'], '/admin/integrity/findings', { all: all ? 'true' : undefined, limit: '50' })
  const rows = list.data?.pages.flatMap((p) => p.items) ?? []
  const reseal = useMutation({
    mutationFn: ({ f, reason }: { f: IntegrityFinding; reason: string }) => api.post<IntegrityFinding>(`/admin/integrity/findings/${f.id}/reseal`, { reason }),
    onSuccess: (r) => { toast.success(r.resolution ? t('done') : t('requested')); setActing(null); void qc.invalidateQueries({ queryKey: ['admin', 'integrity'] }) },
    onError: (e) => { toast.error(describeError(t, e)); setActing(null); void qc.invalidateQueries({ queryKey: ['admin', 'integrity'] }) },
  })
  const columns: Column<IntegrityFinding>[] = [
    { key: 'table', header: t('cols.table'), cell: (f) => <bdi dir='ltr' className='font-mono text-xs'>{f.table}</bdi> },
    { key: 'row', header: t('cols.row'), cell: (f) => <bdi dir='ltr' className='font-mono text-xs'>{f.row_key}</bdi> },
    { key: 'check', header: t('cols.check'), cell: (f) => <div><div>{t(`check.${f.check}`)}</div><div className='text-xs text-muted-foreground'>{t(`by.${f.detected_by}`)}</div></div> },
    { key: 'det', header: t('cols.detected'), cell: (f) => <DateTime value={f.detected_at} /> },
    { key: 'seen', header: t('cols.seen'), cell: (f) => <span className='tabular-nums'>{f.seen_count}</span> },
    { key: 'state', header: t('cols.state'), cell: (f) => { const s = stateOf(f); return <StatusPill tone={s === 'open' ? 'bad' : s === 'requested' ? 'warn' : 'ok'}>{f.resolution ? t(`resolution.${f.resolution}`) : t(`state.${s}`)}</StatusPill> } },
    {
      key: 'act', header: '', cell: (f) => {
        if (f.resolution || !canApprove) return null
        const own = f.reseal_requested_by === me
        return (
          <div className='grid gap-2'>
            {f.reseal_requested_by && (
              <div className='max-w-xs text-xs text-muted-foreground'>
                <div>{t('requestedBy', { who: f.reseal_requested_by })}</div>
                {f.reseal_request_reason && <div>{t('reasonOf')}: {f.reseal_request_reason}</div>}
                {f.reseal_values && <div>{t('pinned', { v: f.reseal_row_version })}: <bdi dir='ltr' className='font-mono'>{JSON.stringify(f.reseal_values)}</bdi></div>}
              </div>
            )}
            <Button size='sm' disabled={own} title={own ? t('ownRequest') : undefined} onClick={() => setActing(f)}>{f.reseal_requested_by ? t('approve') : t('reseal')}</Button>
          </div>
        )
      },
    },
  ]
  return (
    <>
      <PageHeader title={t('title')} />
      <Main>
        <p className='mb-3 max-w-2xl text-sm text-muted-foreground'>{t('subtitle')}</p>
        <div className='mb-4 flex items-center gap-2'><Checkbox id='all' checked={all} onCheckedChange={(v) => setAll(v === true)} /><Label htmlFor='all'>{t('showAll')}</Label></div>
        <DataTable columns={columns} rows={rows} rowKey={(f) => String(f.id)} loading={list.isPending} error={list.isError ? describeError(t, list.error) : undefined} empty={t('empty')}
          hasMore={list.hasNextPage} loadingMore={list.isFetchingNextPage} onLoadMore={() => void list.fetchNextPage()} />
      </Main>
      {acting && (
        <ReasonDialog
          open title={t('resealTitle', { row: acting.row_key })} description={t('resealBody')} confirmLabel={acting.reseal_requested_by ? t('approve') : t('reseal')}
          busy={reseal.isPending} onCancel={() => setActing(null)} onConfirm={(reason) => reseal.mutate({ f: acting, reason })}
        />
      )}
    </>
  )
}
