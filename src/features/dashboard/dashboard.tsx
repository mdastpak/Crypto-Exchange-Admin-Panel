import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { api } from '@/api/client'
import type { Currency, IntegrityFinding, Market, Page, Payout, PlatformOverview, PriceOverride, Withdrawal } from '@/api/models'
import { useCan } from '@/auth/permissions'
import { Main } from '@/components/layout/main'
import { PageHeader } from '@/components/page-header'
import { StatusPill } from '@/components/status-pill'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

/** Each tile reads only what the administrator may see, and is absent otherwise. */
export function Dashboard() {
  const { t } = useTranslation('dashboard')
  const { t: tn } = useTranslation('nav')
  const canPlatform = useCan('platform', 'view')
  const canCurrencies = useCan('currencies', 'view')
  const canPrices = useCan('prices', 'view')
  const canMarkets = useCan('markets', 'view')
  const canWithdrawals = useCan('withdrawals', 'view')
  const canPayouts = useCan('payouts', 'view')
  const canIntegrity = useCan('integrity', 'view')

  const platform = useQuery({ queryKey: ['admin', 'platform'], queryFn: () => api.get<PlatformOverview>('/admin/platform'), enabled: canPlatform, refetchInterval: 15_000 })
  const pending = useQuery({ queryKey: ['admin', 'currencies', 'pending-count'], queryFn: () => api.get<Page<Currency>>('/admin/currencies?status=pending&limit=200'), enabled: canCurrencies })
  const overrides = useQuery({ queryKey: ['admin', 'price-overrides'], queryFn: () => api.get<PriceOverride[]>('/admin/price-overrides'), enabled: canPrices, refetchInterval: 15_000 })
  const markets = useQuery({ queryKey: ['admin', 'markets'], queryFn: () => api.get<Market[]>('/admin/markets'), enabled: canMarkets })

  const wd = useQuery({ queryKey: ['admin', 'withdrawals', 'review'], queryFn: () => api.get<Withdrawal[]>('/admin/withdrawals?status=review&limit=100'), enabled: canWithdrawals, refetchInterval: 20_000 })
  const po = useQuery({ queryKey: ['admin', 'payouts', 'submitted'], queryFn: () => api.get<Payout[]>('/admin/payouts?status=submitted&limit=100'), enabled: canPayouts, refetchInterval: 20_000 })
  const ig = useQuery({ queryKey: ['admin', 'integrity', 'open-count'], queryFn: () => api.get<Page<IntegrityFinding>>('/admin/integrity/findings?limit=100'), enabled: canIntegrity, refetchInterval: 30_000 })

  const waiting = overrides.data?.filter((o) => o.pending).length ?? 0
  const inForce = overrides.data?.filter((o) => o.in_force).length ?? 0
  const attention = markets.data?.filter((m) => m.status !== 'ACTIVE').length ?? 0

  return (
    <>
      <PageHeader title={tn('dashboard')} />
      <Main>
        <h2 className='mb-4 text-lg font-semibold'>{t('welcome')}</h2>
        <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-4'>
          {canPlatform && (
            <Tile title={t('platform')} to='/platform' loading={platform.isPending}>
              {platform.data && (
                <div className='flex flex-wrap gap-2'>
                  <StatusPill tone={platform.data.status.mode === 'open' ? 'ok' : 'warn'}>{t(`platform:mode.${platform.data.status.mode}`)}</StatusPill>
                  {platform.data.status.lockdowns.map((f) => <StatusPill key={f} tone='bad'>{t(`platform:feature.${f}`)}</StatusPill>)}
                </div>
              )}
            </Tile>
          )}
          {canWithdrawals && (
            <Tile title={t('withdrawalsReview')} to='/withdrawals' loading={wd.isPending}><Big n={wd.data?.length ?? 0} warn /></Tile>
          )}
          {canPayouts && (
            <Tile title={t('submittedPayouts')} to='/payouts' loading={po.isPending}><Big n={po.data?.length ?? 0} warn /></Tile>
          )}
          {canIntegrity && (
            <Tile title={t('integrityOpen')} to='/integrity' loading={ig.isPending}><Big n={ig.data?.items.length ?? 0} warn /></Tile>
          )}
          {canCurrencies && (
            <Tile title={t('pendingCurrencies')} to='/currencies' loading={pending.isPending}>
              <Big n={pending.data?.items.length ?? 0} warn />
            </Tile>
          )}
          {canPrices && (
            <Tile title={t('priceOverrides')} to='/prices' loading={overrides.isPending}>
              <div className='flex gap-4 text-sm'>
                <span><Big n={waiting} warn />{t('overridesWaiting')}</span>
                <span><Big n={inForce} />{t('overridesInForce')}</span>
              </div>
            </Tile>
          )}
          {canMarkets && (
            <Tile title={t('marketsAttention')} to='/markets' loading={markets.isPending}>
              <Big n={attention} warn />
            </Tile>
          )}
        </div>
      </Main>
    </>
  )
}

function Big({ n, warn }: { n: number; warn?: boolean }) {
  return <div className={`text-3xl font-semibold tabular-nums ${warn && n > 0 ? 'text-amber-600 dark:text-amber-400' : ''}`}>{n}</div>
}

function Tile({ title, to, loading, children }: { title: string; to: string; loading: boolean; children: React.ReactNode }) {
  const { t } = useTranslation('dashboard')
  return (
    <Card>
      <CardHeader className='pb-2'><CardTitle className='text-sm font-medium text-muted-foreground'>{title}</CardTitle></CardHeader>
      <CardContent className='grid gap-3'>
        {loading ? <Skeleton className='h-9 w-24' /> : children}
        <Link to={to} className='text-xs text-muted-foreground underline-offset-4 hover:underline'>{t('viewAll')}</Link>
      </CardContent>
    </Card>
  )
}
