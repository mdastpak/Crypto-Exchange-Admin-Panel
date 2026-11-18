import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { api } from '@/api/client'
import type { Market, ReferencePrice } from '@/api/models'
import { ApiError } from '@/api/types'
import { useCan } from '@/auth/permissions'
import { describeError } from '@/lib/errors'
import { bpsToPercent, price } from '@/lib/format'
import { DateTime } from '@/components/date-time'
import { Main } from '@/components/layout/main'
import { PageHeader } from '@/components/page-header'
import { StatusPill } from '@/components/status-pill'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { MarketFormDialog } from './market-form-dialog'
import { marketTone } from './status'
import { OverrideDialog } from './override-dialog'
import { OverridesTable } from './overrides-table'

export function MarketDetail({ base, quote }: { base: string; quote: string }) {
  const { t } = useTranslation('markets')
  const symbol = `${base}/${quote}`
  const canEdit = useCan('markets', 'edit')
  const canPrices = useCan('prices', 'view')
  const [editing, setEditing] = useState(false)
  const q = useQuery({ queryKey: ['admin', 'markets', symbol], queryFn: () => api.get<Market>(`/admin/markets/${symbol}`) })
  const m = q.data
  return (
    <>
      <PageHeader title={symbol} />
      <Main>
        <div className='mb-3'><Link to='/markets' className='text-sm text-muted-foreground underline-offset-4 hover:underline'>← {t('title')}</Link></div>
        {q.isPending && <Skeleton className='h-40 w-full' />}
        {q.isError && <p role='alert' className='text-destructive'>{describeError(t, q.error)}</p>}
        {m && (
          <Tabs defaultValue='rules' className='grid gap-4'>
            <TabsList>
              <TabsTrigger value='rules'>{t('tabs.rules')}</TabsTrigger>
              {canPrices && <TabsTrigger value='price'>{t('tabs.price')}</TabsTrigger>}
            </TabsList>
            <TabsContent value='rules'>
              <Card>
                <CardContent className='grid gap-3 pt-6 text-sm sm:grid-cols-2'>
                  <div className='flex items-center gap-2'><span className='text-muted-foreground'>{t('cols.status')}:</span><StatusPill tone={marketTone(m.status)}>{t(`status.${m.status}`)}</StatusPill></div>
                  <div><span className='text-muted-foreground'>{t('form.minOrder')}: </span><bdi dir='ltr'>{m.min_order_size}</bdi></div>
                  <div><span className='text-muted-foreground'>{t('form.maxOrder')}: </span><bdi dir='ltr'>{m.max_order_size}</bdi></div>
                  <div><span className='text-muted-foreground'>{t('form.minNotional')}: </span><bdi dir='ltr'>{m.min_notional}</bdi></div>
                  <div><span className='text-muted-foreground'>{t('form.tick')}: </span><bdi dir='ltr'>{m.tick_size}</bdi></div>
                  <div><span className='text-muted-foreground'>{t('form.lot')}: </span><bdi dir='ltr'>{m.lot_size}</bdi></div>
                  <div><span className='text-muted-foreground'>{t('form.maker')}: </span><bdi dir='ltr'>{m.maker_fee_bps} ({bpsToPercent(m.maker_fee_bps)})</bdi></div>
                  <div><span className='text-muted-foreground'>{t('form.taker')}: </span><bdi dir='ltr'>{m.taker_fee_bps} ({bpsToPercent(m.taker_fee_bps)})</bdi></div>
                  <div><span className='text-muted-foreground'>{t('common:status')}: </span><DateTime value={m.updated_at} /></div>
                  {canEdit && <div className='sm:col-span-2'><Button onClick={() => setEditing(true)}>{t('common:edit')}</Button></div>}
                </CardContent>
              </Card>
            </TabsContent>
            {canPrices && <TabsContent value='price'><PriceTab symbol={symbol} /></TabsContent>}
          </Tabs>
        )}
      </Main>
      {editing && m && <MarketFormDialog market={m} onClose={() => setEditing(false)} />}
    </>
  )
}

function PriceTab({ symbol }: { symbol: string }) {
  const { t } = useTranslation('markets')
  const canSet = useCan('prices', 'edit')
  const [overriding, setOverriding] = useState(false)
  const q = useQuery({
    queryKey: ['admin', 'markets', symbol, 'price'], queryFn: () => api.get<ReferencePrice>(`/admin/markets/${symbol}/price`),
    refetchInterval: 5_000, retry: false,
  })
  const none = q.error instanceof ApiError && q.error.code === 'price_unavailable'
  const live = q.data?.status === 'live' ? q.data.mid : undefined
  return (
    <div className='grid gap-4'>
      <Card>
        <CardHeader className='flex-row items-center justify-between'>
          <CardTitle className='text-base'>{t('tabs.price')}</CardTitle>
          {canSet && <Button size='sm' onClick={() => setOverriding(true)}>{t('price.set')}</Button>}
        </CardHeader>
        <CardContent>
          {q.isPending && <Skeleton className='h-16 w-full' />}
          {none && <p className='text-sm text-muted-foreground'>{t('price.none')}</p>}
          {q.isError && !none && <p role='alert' className='text-sm text-destructive'>{describeError(t, q.error)}</p>}
          {q.data && (
            <div className='grid gap-2 text-sm sm:grid-cols-3'>
              <div className='flex items-center gap-2'><StatusPill tone={q.data.status === 'live' ? 'ok' : 'warn'}>{t(`price.${q.data.status}`)}</StatusPill></div>
              <div><span className='text-muted-foreground'>{t('price.bid')}: </span><bdi dir='ltr' className='tabular-nums'>{price(q.data.bid)}</bdi></div>
              <div><span className='text-muted-foreground'>{t('price.ask')}: </span><bdi dir='ltr' className='tabular-nums'>{price(q.data.ask)}</bdi></div>
              <div className='text-lg font-semibold sm:col-span-3'><span className='text-sm font-normal text-muted-foreground'>{t('price.mid')}: </span><bdi dir='ltr' className='tabular-nums'>{price(q.data.mid)}</bdi></div>
              {q.data.sources && <div className='sm:col-span-3'><span className='text-muted-foreground'>{t('price.sources')}: </span><bdi dir='ltr'>{q.data.sources.join(', ')}</bdi></div>}
              <div className='sm:col-span-3'><span className='text-muted-foreground'>{t('price.updated')}: </span><DateTime value={q.data.updated} /></div>
            </div>
          )}
        </CardContent>
      </Card>
      <div>
        <h3 className='mb-2 text-sm font-semibold'>{t('price.overrides')}</h3>
        <OverridesTable market={symbol} />
      </div>
      {overriding && <OverrideDialog market={symbol} referenceMid={live} onClose={() => setOverriding(false)} />}
    </div>
  )
}
