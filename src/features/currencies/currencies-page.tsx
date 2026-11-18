import { useDeferredValue, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useCursorList } from '@/api/use-cursor-list'
import type { Currency } from '@/api/models'
import { useCan } from '@/auth/permissions'
import { describeError } from '@/lib/errors'
import { DataTable, type Column } from '@/components/data-table'
import { DateTime } from '@/components/date-time'
import { Main } from '@/components/layout/main'
import { PageHeader } from '@/components/page-header'
import { StatusPill } from '@/components/status-pill'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CurrencyFormDialog } from './currency-form-dialog'
import { lifecycleTone, statusTone } from './status'

export function CurrenciesPage() {
  const { t } = useTranslation('currencies')
  const navigate = useNavigate()
  const canEdit = useCan('currencies', 'edit')
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('all')
  const [creating, setCreating] = useState(false)
  const dq = useDeferredValue(q.trim())
  const list = useCursorList<Currency>(['admin', 'currencies'], '/admin/currencies', {
    q: dq || undefined, status: status === 'all' ? undefined : status, limit: '50',
  })
  const rows = list.data?.pages.flatMap((p) => p.items) ?? []

  const columns: Column<Currency>[] = [
    { key: 'symbol', header: t('cols.symbol'), cell: (c) => <bdi dir='ltr' className='font-mono font-semibold'>{c.info.symbol}</bdi> },
    { key: 'name', header: t('cols.name'), cell: (c) => <div><div>{c.info.fa_name}</div><div className='text-xs text-muted-foreground' dir='ltr'>{c.info.en_name}</div></div> },
    { key: 'kind', header: t('cols.kind'), cell: (c) => t(`kind.${c.info.if_fiat ? 'fiat' : c.info.is_token ? 'token' : 'coin'}`) },
    { key: 'status', header: t('cols.status'), cell: (c) => <StatusPill tone={statusTone(c.status)}>{t(`status.${c.status}`)}</StatusPill> },
    { key: 'lifecycle', header: t('cols.lifecycle'), cell: (c) => <StatusPill tone={lifecycleTone(c.lifecycle?.state)}>{t(`lifecycle.${c.lifecycle?.state ?? 'active'}`)}</StatusPill> },
    { key: 'version', header: t('cols.version'), cell: (c) => <span className='tabular-nums'>{c.version}</span> },
    { key: 'updated', header: t('cols.updated'), cell: (c) => <DateTime value={c.updated_at} /> },
  ]

  return (
    <>
      <PageHeader title={t('title')} />
      <Main>
        <div className='mb-4 flex flex-wrap items-center gap-3'>
          <Input className='w-64' dir='auto' aria-label={t('search')} placeholder={t('search')} value={q} onChange={(e) => setQ(e.target.value)} />
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className='w-44' aria-label={t('statusFilter')}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>{t('common:all')}</SelectItem>
              {(['approved', 'pending', 'suspend', 'deleted'] as const).map((s) => <SelectItem key={s} value={s}>{t(`status.${s}`)}</SelectItem>)}
            </SelectContent>
          </Select>
          {canEdit && <Button className='ms-auto' onClick={() => setCreating(true)}>{t('new')}</Button>}
        </div>
        <DataTable
          columns={columns} rows={rows} rowKey={(c) => c.hk}
          loading={list.isPending} error={list.isError ? describeError(t, list.error) : undefined}
          hasMore={list.hasNextPage} loadingMore={list.isFetchingNextPage} onLoadMore={() => void list.fetchNextPage()}
          onRowClick={(c) => void navigate({ to: '/currencies/$hk', params: { hk: c.hk } })}
        />
      </Main>
      {creating && <CurrencyFormDialog open onClose={() => setCreating(false)} />}
    </>
  )
}
