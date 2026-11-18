import { useTranslation } from 'react-i18next'
import { Main } from '@/components/layout/main'
import { PageHeader } from '@/components/page-header'
import { OverridesTable } from './overrides-table'

export function PricesPage() {
  const { t } = useTranslation('markets')
  return (
    <>
      <PageHeader title={t('pricesTitle')} />
      <Main><OverridesTable /></Main>
    </>
  )
}
