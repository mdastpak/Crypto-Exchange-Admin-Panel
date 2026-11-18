import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { api } from '@/api/client'
import type { Market } from '@/api/models'
import { useCan } from '@/auth/permissions'
import { describeError } from '@/lib/errors'
import { bpsToPercent } from '@/lib/format'
import { DataTable, type Column } from '@/components/data-table'
import { Main } from '@/components/layout/main'
import { PageHeader } from '@/components/page-header'
import { StatusPill } from '@/components/status-pill'
import { Button } from '@/components/ui/button'
import { MarketFormDialog } from './market-form-dialog'
import { marketTone } from './status'

export function MarketsPage() {
  const { t } = useTranslation('markets')
  const navigate = useNavigate()
  const canEdit = useCan('markets', 'edit')
  const [creating, setCreating] = useState(false)
  const q = useQuery({ queryKey: ['admin', 'markets'], queryFn: () => api.get<Market[]>('/admin/markets') })
  const columns: Column<Market>[] = [
    { key: 'm', header: t('cols.market'), cell: (m) => <bdi dir='ltr' className='font-mono font-semibold'>{m.base_symbol}/{m.quote_symbol}</bdi> },
    { key: 's', header: t('cols.status'), cell: (m) => <StatusPill tone={marketTone(m.status)}>{t(`status.${m.status}`)}</StatusPill> },
    { key: 'o', header: t('cols.orderSize'), cell: (m) => <bdi dir='ltr'>{m.min_order_size} – {m.max_order_size === '0' ? '∞' : m.max_order_size}</bdi> },
    { key: 'n', header: t('cols.notional'), cell: (m) => <bdi dir='ltr'>{m.min_notional}</bdi> },
    { key: 't', header: t('cols.tickLot'), cell: (m) => <bdi dir='ltr'>{m.tick_size} / {m.lot_size}</bdi> },
    { key: 'f', header: t('cols.fees'), cell: (m) => <bdi dir='ltr'>{bpsToPercent(m.maker_fee_bps)} / {bpsToPercent(m.taker_fee_bps)}</bdi> },
  ]
  return (
    <>
      <PageHeader title={t('title')} />
      <Main>
        {canEdit && <div className='mb-4 flex'><Button className='ms-auto' onClick={() => setCreating(true)}>{t('new')}</Button></div>}
        <DataTable
          columns={columns} rows={q.data ?? []} rowKey={(m) => `${m.base_symbol}/${m.quote_symbol}`}
          loading={q.isPending} error={q.isError ? describeError(t, q.error) : undefined}
          onRowClick={(m) => void navigate({ to: '/markets/$base/$quote', params: { base: m.base_symbol, quote: m.quote_symbol } })}
        />
      </Main>
      {creating && <MarketFormDialog onClose={() => setCreating(false)} />}
    </>
  )
}
